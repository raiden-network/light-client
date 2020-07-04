import { Observable, of, from, EMPTY, merge } from 'rxjs';
import {
  filter,
  map,
  withLatestFrom,
  mergeMap,
  pluck,
  first,
  concatMap,
  catchError,
  tap,
  take,
  mapTo,
  takeUntil,
  share,
} from 'rxjs/operators';

import { Capabilities } from '../../constants';
import { channelKey, assertTx } from '../../channels/utils';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../../state';
import { RaidenEpicDeps } from '../../types';
import { ChannelState } from '../../channels';
import { isResponseOf } from '../../utils/actions';
import { assert, ErrorCodes, RaidenError } from '../../utils/error';
import { Signed } from '../../utils/types';
import { LruCache } from '../../utils/lru';
import { Processed, MessageType, signMessage, isMessageReceivedOfType } from '../../messages';
import { messageSend } from '../../messages/actions';
import { newBlock } from '../../channels/actions';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import { withdrawExpire, withdrawMessage, withdraw, withdrawExpireProcessed } from '../actions';
import { Direction } from '../state';
import { retrySendUntil$ } from './utils';

/**
 * Retry sending 'WithdrawRequest' messages to partner until WithdrawConfirmation is received
 *
 * @param action$ - Observable of withdrawRequest.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of messageSend.request actions
 */
export const withdrawSendRequestMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<messageSend.request> =>
  action$.pipe(
    filter(withdrawMessage.request.is),
    filter((action) => action.meta.direction === Direction.SENT),
    withLatestFrom(config$),
    mergeMap(([action, { httpTimeout }]) => {
      const message = action.payload.message;
      const send = messageSend.request(
        { message },
        { address: action.meta.partner, msgId: message.message_identifier.toString() },
      );
      // emits to stop retry when respective WithdrawConfirmation is received or the whole withdraw
      // fails, which happens e.g. when it expires soon
      const notifier = action$.pipe(
        filter(
          (a) =>
            isResponseOf(withdrawMessage, action.meta, a) ||
            isResponseOf(withdraw, action.meta, a),
        ),
      );
      // emit request once immediatelly, then wait until success, then retry every 30s
      return retrySendUntil$(send, action$, notifier, httpTimeout);
    }),
  );

/**
 * Emits withdraw.failure if we get 'revealTimeout' blocks close to expiration
 *
 * Before this threshold we're still confident we can make a withdraw tx go through, and therefore
 * give up if we get too close.
 *
 * @param action$ - Observable of withdrawRequest.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of withdraw.failure actions
 */
export const withdrawExpiresSoonEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<withdraw.failure> =>
  action$.pipe(
    filter(withdrawMessage.request.is),
    filter((action) => action.meta.direction === Direction.SENT),
    withLatestFrom(config$),
    mergeMap(([action, { revealTimeout }]) =>
      action$.pipe(
        filter(newBlock.is),
        filter(({ payload }) => action.meta.expiration < payload.blockNumber + revealTimeout),
        take(1),
        mapTo(withdraw.failure(new RaidenError(ErrorCodes.WITHDRAW_EXPIRES_SOON), action.meta)),
        // if withdrawMessage.success (WithdrawConfirmation) go through, don't fail
        takeUntil(
          action$.pipe(filter(isResponseOf<typeof withdrawMessage>(withdrawMessage, action.meta))),
        ),
      ),
    ),
  );

/**
 * Upon WithdrawConfirmation, send the on-chain withdraw request
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.address - Our address
 * @param deps.signer - Signer instance
 * @param deps.main - Main signer and address (if present)
 * @param deps.log - Logger instance
 * @param deps.getTokenNetworkContract - TokenNetwork contract getter
 * @param deps.latest$ - Latest observable
 * @returns Observable of withdrawExpired actions
 */
export const withdrawSendTxEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { address, signer, main, log, getTokenNetworkContract, latest$ }: RaidenEpicDeps,
): Observable<withdraw.success | withdraw.failure> =>
  action$.pipe(
    filter(withdrawMessage.success.is),
    filter((action) => action.meta.direction === Direction.SENT),
    concatMap((action) =>
      latest$.pipe(
        first(),
        mergeMap(({ state, config }) => {
          const { subkey: configSubkey, revealTimeout } = config;
          // don't send on-chain tx if we're 'revealTimeout' blocks from expiration
          // this is our confidence threshold when we can get a tx inside timeout
          assert(
            action.meta.expiration >= state.blockNumber + revealTimeout,
            ErrorCodes.WITHDRAW_EXPIRES_SOON,
          );
          const channel = state.channels[channelKey(action.meta)];
          assert(channel?.state === ChannelState.open, 'channel not open');
          assert(action.meta.totalWithdraw.gt(channel.own.withdraw), 'withdraw already performed');
          const req = channel.own.pendingWithdraws.find(
            (req) =>
              req.type === MessageType.WITHDRAW_REQUEST &&
              req.total_withdraw.eq(action.payload.message.total_withdraw) &&
              req.expiration.eq(action.payload.message.expiration),
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

          return tokenNetworkContract.functions.setTotalWithdraw(
            channel.id,
            address,
            action.meta.totalWithdraw,
            action.meta.expiration,
            req.signature,
            action.payload.message.signature,
          );
        }),
        assertTx('setTotalWithdraw', ErrorCodes.WITHDRAW_TRANSACTION_FAILED, { log }),
        map((receipt) =>
          withdraw.success(
            {
              txHash: receipt.transactionHash,
              txBlock: receipt.blockNumber,
              confirmed: undefined,
            },
            action.meta,
          ),
        ),
        catchError((err) => of(withdraw.failure(err, action.meta))),
      ),
    ),
  );

/**
 * Upon WithdrawConfirmation, send partner the respective Processed message
 *
 * SDK-based clients (with caps.noDelivery set) don't need it, so skip
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.signer - Signer instance
 * @param deps.log - Logger instance
 * @param deps.latest$ - Latest observable
 * @returns Observable of withdrawExpired actions
 */
export const withdrawConfirmationProcessedEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { signer, log, latest$ }: RaidenEpicDeps,
): Observable<messageSend.request> => {
  const cache = new LruCache<string, Signed<Processed>>(32);
  return action$.pipe(
    filter(withdrawMessage.success.is),
    filter((action) => action.meta.direction === Direction.SENT),
    concatMap((action) =>
      latest$.pipe(
        first(),
        filter(
          ({ presences }) =>
            // if caps.noDelivery is set for partner, they don't need this Processed either
            action.meta.partner in presences &&
            !presences[action.meta.partner].payload.caps?.[Capabilities.NO_DELIVERY],
        ),
        mergeMap(() => {
          const confirmation = action.payload.message;
          let processed$: Observable<Signed<Processed>>;
          const cacheKey = confirmation.message_identifier.toString();
          const cached = cache.get(cacheKey);
          if (cached) processed$ = of(cached);
          else {
            const processed: Processed = {
              type: MessageType.PROCESSED,
              message_identifier: confirmation.message_identifier,
            };
            processed$ = from(signMessage(signer, processed, { log })).pipe(
              tap((signed) => cache.put(cacheKey, signed)),
            );
          }

          // don't validate req here, to always update nonce, but do on tx send
          return processed$.pipe(
            map((processed) =>
              messageSend.request(
                { message: processed },
                { address: action.meta.partner, msgId: processed.message_identifier.toString() },
              ),
            ),
          );
        }),
        catchError(
          (err) => (
            log.info('Signing Processed message for WithdrawConfirmation failed, ignoring', err),
            EMPTY
          ),
        ),
      ),
    ),
  );
};

/**
 * Dispatch withdrawExpire.request when one of our sent WithdrawRequests expired
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of withdrawExpired actions
 */
export const autoWithdrawExpireEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<withdrawExpire.request> =>
  action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    withLatestFrom(state$, config$),
    mergeMap(function* ([blockNumber, state, { confirmationBlocks }]) {
      for (const channel of Object.values(state.channels)) {
        if (channel.state !== ChannelState.open) continue;
        for (const req of channel.own.pendingWithdraws) {
          if (req.type !== MessageType.WITHDRAW_REQUEST) continue;
          if (req.expiration.add(confirmationBlocks).gt(blockNumber)) continue;
          // if there's already an WithdrawExpired in 'pendingWithdraws' array, don't request again
          if (
            channel.own.pendingWithdraws.some(
              (exp) =>
                exp.type === MessageType.WITHDRAW_EXPIRED &&
                exp.total_withdraw.eq(req.total_withdraw) &&
                exp.expiration.eq(req.expiration),
            )
          )
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

/**
 * Retry sending own WithdrawExpired messages until Processed
 *
 * @param action$ - Observable of withdrawExpire.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @returns Observable of messageSend.request actions
 */
export const withdrawSendExpireMessageEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { config$ }: RaidenEpicDeps,
): Observable<messageSend.request | withdrawExpireProcessed> =>
  action$.pipe(
    filter(withdrawExpire.success.is),
    filter((action) => action.meta.direction === Direction.SENT),
    withLatestFrom(config$),
    mergeMap(([action, { httpTimeout }]) => {
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
        map((a) => withdrawExpireProcessed(a.payload, action.meta)),
        take(1),
        share(),
      );
      // besides using notifier to stop retry, also merge the withdrawExpireProcessed output
      return merge(retrySendUntil$(send, action$, notifier, httpTimeout), notifier);
    }),
  );

/**
 * Emits withdrawExpire.success once for each own non-confirmed WithdrawExpired message at startup
 *
 * @param state$ - Observable of RaidenStates
 * @returns Observable of withdrawExpire.success actions
 */
export const initWithdrawExpiredEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<withdrawExpire.success> =>
  state$.pipe(
    first(),
    mergeMap(function* (state) {
      for (const channel of Object.values(state.channels)) {
        for (const exp of channel.own.pendingWithdraws) {
          if (exp.type !== MessageType.WITHDRAW_EXPIRED) continue;
          yield withdrawExpire.success(
            { message: exp },
            {
              direction: Direction.SENT,
              tokenNetwork: channel.tokenNetwork,
              partner: channel.partner.address,
              totalWithdraw: exp.total_withdraw,
              expiration: exp.expiration.toNumber(),
            },
          );
        }
      }
    }),
  );
