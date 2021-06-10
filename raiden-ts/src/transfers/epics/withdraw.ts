import type { Observable } from 'rxjs';
import { defer, EMPTY, from, merge, of } from 'rxjs';
import {
  catchError,
  concatMap,
  filter,
  first,
  map,
  mapTo,
  mergeMap,
  pluck,
  share,
  take,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { ChannelState } from '../../channels';
import { newBlock } from '../../channels/actions';
import { assertTx, channelKey } from '../../channels/utils';
import { intervalFromConfig } from '../../config';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import { isMessageReceivedOfType, MessageType, Processed, signMessage } from '../../messages';
import { messageSend } from '../../messages/actions';
import type { RaidenState } from '../../state';
import { getNoDeliveryPeers } from '../../transport/utils';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { assert, commonTxErrors, ErrorCodes } from '../../utils/error';
import { LruCache } from '../../utils/lru';
import { retryWhile } from '../../utils/rx';
import { Signed } from '../../utils/types';
import { withdraw, withdrawCompleted, withdrawExpire, withdrawMessage } from '../actions';
import { Direction } from '../state';
import { matchWithdraw, retrySendUntil$ } from './utils';

/**
 * Emits withdraw action once for each own non-confirmed message at startup
 *
 * @param state$ - Observable of RaidenStates
 * @returns Observable of withdrawMessage.request|withdrawExpire.success actions
 */
export function initWithdrawMessagesEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<withdrawMessage.request | withdrawExpire.success> {
  return state$.pipe(
    first(),
    mergeMap(function* (state) {
      for (const channel of Object.values(state.channels)) {
        if (channel.state !== ChannelState.open) continue;
        for (const message of channel.own.pendingWithdraws) {
          if (
            message.type === MessageType.WITHDRAW_REQUEST &&
            !channel.own.pendingWithdraws.some(
              matchWithdraw(MessageType.WITHDRAW_CONFIRMATION, message), // ignore if confirmed
            )
          )
            yield withdrawMessage.request(
              { message },
              {
                direction: Direction.SENT,
                tokenNetwork: channel.tokenNetwork,
                partner: channel.partner.address,
                totalWithdraw: message.total_withdraw,
                expiration: message.expiration.toNumber(),
              },
            );
          else if (message.type === MessageType.WITHDRAW_EXPIRED)
            yield withdrawExpire.success(
              { message },
              {
                direction: Direction.SENT,
                tokenNetwork: channel.tokenNetwork,
                partner: channel.partner.address,
                totalWithdraw: message.total_withdraw,
                expiration: message.expiration.toNumber(),
              },
            );
          // WithdrawConfirmations are sent only as response of requests
        }
      }
    }),
  );
}

/**
 * Retry sending 'WithdrawRequest' messages to partner until WithdrawConfirmation is received
 *
 * @param action$ - Observable of withdrawRequest.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of messageSend.request actions
 */
export function withdrawSendRequestMessageEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<messageSend.request> {
  return action$.pipe(
    filter(withdrawMessage.request.is),
    filter((action) => action.meta.direction === Direction.SENT),
    mergeMap((action) => {
      const message = action.payload.message;
      const send = messageSend.request(
        { message },
        { address: action.meta.partner, msgId: message.message_identifier.toString() },
      );
      // emits to stop retry loop when channel isn't open anymore, a confirmation came or request
      // got cleared from state (e.g. by effective withdraw tx)
      const notifier = state$.pipe(
        filter((state) => {
          const channel = state.channels[channelKey(action.meta)];
          return (
            channel?.state !== ChannelState.open ||
            channel.own.pendingWithdraws.some(
              matchWithdraw(MessageType.WITHDRAW_CONFIRMATION, action.meta),
            ) ||
            !channel.own.pendingWithdraws.some(
              matchWithdraw(MessageType.WITHDRAW_REQUEST, action.meta),
            )
          );
        }),
      );
      // emit request once immediatelly, then wait until success, then retry every 30s
      return retrySendUntil$(send, action$, notifier, intervalFromConfig(config$));
    }),
  );
}

/**
 * Upon valid [[WithdrawConfirmation]], send the on-chain withdraw transaction
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.address - Our address
 * @param deps.signer - Signer instance
 * @param deps.main - Main signer and address (if present)
 * @param deps.provider - Provider instance
 * @param deps.log - Logger instance
 * @param deps.getTokenNetworkContract - TokenNetwork contract getter
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @returns Observable of withdrawExpired actions
 */
export function withdrawSendTxEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  {
    address,
    signer,
    main,
    provider,
    log,
    getTokenNetworkContract,
    latest$,
    config$,
  }: RaidenEpicDeps,
): Observable<withdraw.success | withdraw.failure> {
  return action$.pipe(
    filter(withdrawMessage.success.is),
    filter((action) => action.meta.direction === Direction.SENT),
    concatMap((action) =>
      latest$.pipe(
        first(),
        mergeMap(({ state, config, gasPrice }) => {
          const { subkey: configSubkey, revealTimeout } = config;
          // don't send on-chain tx if we're 'revealTimeout' blocks from expiration
          // this is our confidence threshold when we can get a tx inside timeout
          assert(
            action.meta.expiration >= state.blockNumber + revealTimeout,
            ErrorCodes.CNL_WITHDRAW_EXPIRES_SOON,
          );
          const channel = state.channels[channelKey(action.meta)];
          assert(channel?.state === ChannelState.open, 'channel not open');
          assert(action.meta.totalWithdraw.gt(channel.own.withdraw), 'withdraw already performed');
          const req = channel.own.pendingWithdraws.find(
            matchWithdraw(MessageType.WITHDRAW_REQUEST, action.payload.message),
          );
          assert(req, 'no matching WithdrawRequest found');
          const { tokenNetwork } = action.meta;
          const { signer: onchainSigner } = chooseOnchainAccount(
            { signer, address, main },
            configSubkey,
          );
          const tokenNetworkContract = getContractWithSigner(
            getTokenNetworkContract(tokenNetwork),
            onchainSigner,
          );

          return defer(() =>
            tokenNetworkContract.setTotalWithdraw(
              channel.id,
              address,
              action.meta.totalWithdraw,
              action.meta.expiration,
              req.signature,
              action.payload.message.signature,
              { gasPrice },
            ),
          ).pipe(
            assertTx('setTotalWithdraw', ErrorCodes.CNL_WITHDRAW_TRANSACTION_FAILED, {
              log,
              provider,
            }),
            retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.debug }),
          );
        }),
        map(([, receipt]) =>
          withdraw.success(
            {
              txHash: receipt.transactionHash,
              txBlock: receipt.blockNumber,
              // no sensitive value in payload, let confirmationEpic confirm it
              confirmed: undefined,
            },
            action.meta,
          ),
        ),
        catchError((err) => of(withdraw.failure(err, action.meta))),
      ),
    ),
  );
}

/**
 * Upon receiving withdraw request or confirmation, send partner the respective Processed message
 *
 * SDK-based clients (with caps.Delivery set) don't need it, so skip. They, instead, confirm
 * the request with the confirmation, and re-sends confirmation on request retries
 *
 * @param action$ - Observable of withdrawMessage.request|withdrawMessage.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.signer - Signer instance
 * @param deps.log - Logger instance
 * @returns Observable of messageSend.request actions
 */
export function withdrawMessageProcessedEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { signer, log }: RaidenEpicDeps,
): Observable<messageSend.request> {
  const cache = new LruCache<string, Signed<Processed>>(32);
  return action$.pipe(
    filter(isActionOf([withdrawMessage.request, withdrawMessage.success])),
    filter(
      (action) =>
        (action.meta.direction === Direction.RECEIVED) !== withdrawMessage.success.is(action),
    ),
    withLatestFrom(getNoDeliveryPeers()(action$)),
    concatMap(([action, noDelivery]) =>
      defer(() => {
        if (noDelivery.has(action.meta.partner)) return EMPTY;
        const message = action.payload.message;
        let processed$: Observable<Signed<Processed>>;
        const cacheKey = message.message_identifier.toString();
        const cached = cache.get(cacheKey);
        if (cached) processed$ = of(cached);
        else {
          const processed: Processed = {
            type: MessageType.PROCESSED,
            message_identifier: message.message_identifier,
          };
          processed$ = from(signMessage(signer, processed, { log })).pipe(
            tap((signed) => cache.set(cacheKey, signed)),
          );
        }

        return processed$.pipe(
          map((processed) =>
            messageSend.request(
              { message: processed },
              { address: action.meta.partner, msgId: processed.message_identifier.toString() },
            ),
          ),
        );
      }).pipe(
        catchError(
          (err) => (
            log.info('Signing Processed message for Withdraw message failed, ignoring', err), EMPTY
          ),
        ),
      ),
    ),
  );
}

/**
 * Dispatch withdrawExpire.request when one of our sent WithdrawRequests expired
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of withdrawExpired actions
 */
export function autoWithdrawExpireEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<withdrawExpire.request> {
  return action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    withLatestFrom(state$, config$),
    mergeMap(function* ([blockNumber, state, { confirmationBlocks }]) {
      for (const channel of Object.values(state.channels)) {
        if (channel.state !== ChannelState.open) continue;
        const requestMessages = channel.own.pendingWithdraws.filter(
          matchWithdraw(MessageType.WITHDRAW_REQUEST),
        );
        for (const req of requestMessages) {
          if (req.expiration.add(confirmationBlocks * 2).gte(blockNumber)) continue;
          if (channel.own.pendingWithdraws.some(matchWithdraw(MessageType.WITHDRAW_EXPIRED, req)))
            continue;
          yield withdrawExpire.request(undefined, {
            direction: Direction.SENT,
            tokenNetwork: channel.tokenNetwork,
            partner: channel.partner.address,
            expiration: req.expiration.toNumber(),
            totalWithdraw: req.total_withdraw,
          });
        }
      }
    }),
  );
}

/**
 * Retry sending own WithdrawExpired messages until Processed, completes withdraw then
 *
 * @param action$ - Observable of withdrawExpire.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of messageSend.request actions
 */
export function withdrawSendExpireMessageEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<messageSend.request | withdrawCompleted> {
  return action$.pipe(
    filter(withdrawExpire.success.is),
    filter((action) => action.meta.direction === Direction.SENT),
    mergeMap((action) => {
      const message = action.payload.message;
      const send = messageSend.request(
        { message },
        { address: action.meta.partner, msgId: message.message_identifier.toString() },
      );
      // emits to stop retry when a Processed for this WithdrawExpired comes
      const notifier = action$.pipe(
        filter(isMessageReceivedOfType(Signed(Processed))),
        filter(
          (a) =>
            a.meta.address === action.meta.partner &&
            a.payload.message.message_identifier.eq(message.message_identifier),
        ),
        mapTo(withdrawCompleted(undefined, action.meta)),
        take(1),
        share(),
      );
      // besides using notifier to stop retry, also merge the withdrawCompleted output action
      return merge(
        retrySendUntil$(send, action$, notifier, intervalFromConfig(config$)),
        notifier,
      );
    }),
  );
}
