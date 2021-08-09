import type { Observable } from 'rxjs';
import { combineLatest, defer, EMPTY, from, merge, of } from 'rxjs';
import {
  catchError,
  concatMap,
  filter,
  first,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  mergeMapTo,
  pluck,
  share,
  startWith,
  take,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { ChannelState } from '../../channels';
import { channelSettle, newBlock } from '../../channels/actions';
import { assertTx, channelAmounts, channelKey } from '../../channels/utils';
import { intervalFromConfig } from '../../config';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import type { WithdrawRequest } from '../../messages';
import { isMessageReceivedOfType, MessageType, Processed, signMessage } from '../../messages';
import { messageSend } from '../../messages/actions';
import type { RaidenState } from '../../state';
import { matrixPresence } from '../../transport/actions';
import { getNoDeliveryPeers } from '../../transport/utils';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf, isConfirmationResponseOf } from '../../utils/actions';
import { assert, commonTxErrors, ErrorCodes, RaidenError } from '../../utils/error';
import { LruCache } from '../../utils/lru';
import { dispatchRequestAndGetResponse, retryWhile } from '../../utils/rx';
import { isntNil, Signed } from '../../utils/types';
import {
  withdraw,
  withdrawCompleted,
  withdrawExpire,
  withdrawMessage,
  withdrawResolve,
} from '../actions';
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
 * Resolve a withdrawResolve action and emit withdraw.request
 * Resolving withdraws require that partner is online and contracts support `cooperativeSettle`.
 *
 * @param action$ - Observable of withdrawResolve actions
 * @returns Observable of withdraw.request|withdraw.failure actions
 */
export function withdrawResolveEpic(
  action$: Observable<RaidenAction>,
): Observable<matrixPresence.request | withdraw.request | withdraw.failure> {
  return action$.pipe(
    dispatchRequestAndGetResponse(matrixPresence, (requestPresence$) =>
      action$.pipe(
        filter(withdrawResolve.is),
        mergeMap((action) =>
          requestPresence$(
            matrixPresence.request(undefined, { address: action.meta.partner }),
          ).pipe(
            map((presence) => {
              // assert shouldn't fail, because presence request would, but just in case
              assert(presence.payload.available, 'partner offline');
              return withdraw.request(action.payload, action.meta);
            }),
            catchError((err) => of(withdraw.failure(err, action.meta))),
          ),
        ),
      ),
    ),
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
 * @param action$ - Observable of withdrawMessage.success actions
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
 * @returns Observable of withdraw.success|withdraw.failure actions
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
    groupBy((action) => channelKey(action.meta)),
    mergeMap((grouped$) =>
      grouped$.pipe(
        // concatMap handles only one withdraw tx per channel at a time
        concatMap((action) =>
          combineLatest([latest$, config$]).pipe(
            first(),
            mergeMap(([{ state, gasPrice }, { subkey: configSubkey, revealTimeout }]) => {
              // don't send on-chain tx if we're 'revealTimeout' blocks from expiration
              // this is our confidence threshold when we can get a tx inside timeout
              assert(
                action.meta.expiration >= state.blockNumber + revealTimeout,
                ErrorCodes.CNL_WITHDRAW_EXPIRES_SOON,
              );

              const channel = state.channels[grouped$.key];
              assert(channel?.state === ChannelState.open, 'channel not open');
              assert(
                action.meta.totalWithdraw.gt(channel.own.withdraw),
                'withdraw already performed',
              );

              const req = channel.own.pendingWithdraws.find(
                matchWithdraw(MessageType.WITHDRAW_REQUEST, action.payload.message),
              );
              assert(req, 'no matching WithdrawRequest found');

              // don't send withdraw rx if this is a coop_settle request (back or forth)
              if ('coop_settle' in req) return EMPTY;

              const { tokenNetwork } = action.meta;
              const { signer: onchainSigner } = chooseOnchainAccount(
                { signer, address, main },
                configSubkey,
              );
              const tokenNetworkContract = getContractWithSigner(
                getTokenNetworkContract(tokenNetwork),
                onchainSigner,
              );

              return defer(async () =>
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
                retryWhile(intervalFromConfig(config$), {
                  maxRetries: 3,
                  onErrors: commonTxErrors,
                  log: log.debug,
                }),
                mergeMap(([, receipt]) =>
                  action$.pipe(
                    filter(isConfirmationResponseOf(withdraw, action.meta)),
                    take(1),
                    ignoreElements(),
                    // startWith unconfirmed success, but complete only on confirmation/failure
                    startWith(
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
                  ),
                ),
              );
            }),
            catchError((err) => of(withdraw.failure(err, action.meta))),
          ),
        ),
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
): Observable<messageSend.request | withdraw.failure | withdrawCompleted> {
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
        take(1),
        mergeMapTo([
          withdraw.failure(new RaidenError(ErrorCodes.CNL_WITHDRAW_EXPIRED), action.meta),
          withdrawCompleted(undefined, action.meta),
        ]),
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

/**
 * Upon valid [[WithdrawConfirmation]] for a [[WithdrawRequest]].coop_settle=true from partner,
 * also send a [[WithdrawRequest]] with whole balance
 *
 * @param action$ - Observable of withdrawMessage.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @param deps.log - Logger instance
 * @returns Observable of withdraw.request(coop_settle=false) actions
 */
export function coopSettleWithdrawReplyEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$, log }: RaidenEpicDeps,
): Observable<withdraw.request> {
  return action$.pipe(
    filter(withdrawMessage.success.is),
    filter((action) => action.meta.direction === Direction.RECEIVED),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { revealTimeout }]) =>
      defer(() => {
        // don't act if request expires too soon
        assert(
          action.meta.expiration >= state.blockNumber + revealTimeout,
          ErrorCodes.CNL_WITHDRAW_EXPIRES_SOON,
        );

        const channel = state.channels[channelKey(action.meta)];
        assert(channel?.state === ChannelState.open, 'channel not open');

        const { ownTotalWithdrawable, partnerCapacity } = channelAmounts(channel);
        assert(
          !channel.own.locks.length && !channel.partner.locks.length && partnerCapacity.isZero(),
          [
            ErrorCodes.CNL_COOP_SETTLE_NOT_POSSIBLE,
            {
              ownLocks: channel.own.locks,
              partnerLocks: channel.partner.locks,
              partnerCapacity,
            },
          ],
        );

        const req = channel.partner.pendingWithdraws.find(
          matchWithdraw(MessageType.WITHDRAW_REQUEST, action.payload.message),
        );
        assert(req, 'no matching WithdrawRequest found'); // shouldn't happen

        // only reply if this is a coop settle request from partner
        if (!req.coop_settle) return EMPTY;

        return of(
          withdraw.request(
            { coopSettle: false },
            {
              ...action.meta,
              direction: Direction.SENT,
              totalWithdraw: ownTotalWithdrawable,
            },
          ),
        );
      }).pipe(
        catchError((error) => {
          log.warn('Could not reply to CoopSettle request, ignoring', { action, error });
          return EMPTY;
        }),
      ),
    ),
  );
}

/**
 * When both valid [[WithdrawConfirmation]] for a [[WithdrawRequest]].coop_settle=true from us,
 * send a channelSettle.request
 *
 * @param action$ - Observable of withdrawMessage.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @param deps.log - Logger instance
 * @returns Observable of channelSettle.request actions
 */
export function coopSettleEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$, log }: RaidenEpicDeps,
): Observable<channelSettle.request | withdraw.failure> {
  return action$.pipe(
    filter(withdrawMessage.success.is),
    withLatestFrom(state$, config$),
    map(([action, state, { revealTimeout }]) => {
      // don't act if request expires too soon
      if (action.meta.expiration < state.blockNumber + revealTimeout) return;

      const channel = state.channels[channelKey(action.meta)];
      if (channel?.state !== ChannelState.open) return;

      const { ownCapacity, partnerCapacity, ownTotalWithdrawable, partnerTotalWithdrawable } =
        channelAmounts(channel);
      if (
        channel.own.locks.length ||
        channel.partner.locks.length ||
        !ownCapacity.isZero() || // when both capacities are zero, both sides should be ready
        !partnerCapacity.isZero()
      )
        return;

      const ownReq = channel.own.pendingWithdraws.find(
        (msg): msg is Signed<WithdrawRequest> =>
          msg.type === MessageType.WITHDRAW_REQUEST &&
          msg.expiration.gte(state.blockNumber + revealTimeout) &&
          msg.total_withdraw.eq(ownTotalWithdrawable) &&
          !!msg.coop_settle, // only requests where coop_settle is true
      );
      if (!ownReq) return; // not our request

      const ownConfirmation = channel.own.pendingWithdraws.find(
        matchWithdraw(MessageType.WITHDRAW_CONFIRMATION, ownReq),
      );
      const partnerReq = channel.partner.pendingWithdraws.find(
        (msg): msg is Signed<WithdrawRequest> =>
          msg.type === MessageType.WITHDRAW_REQUEST &&
          msg.expiration.gte(state.blockNumber + revealTimeout) &&
          msg.total_withdraw.eq(partnerTotalWithdrawable),
      );
      if (!partnerReq) return; // shouldn't happen
      const partnerConfirmation = channel.partner.pendingWithdraws.find(
        matchWithdraw(MessageType.WITHDRAW_CONFIRMATION, partnerReq),
      );
      if (!ownConfirmation || !partnerConfirmation) {
        log.info('no matching WithdrawConfirmations found', {
          ownConfirmation,
          partnerConfirmation,
        });
        return;
      }

      return channelSettle.request(
        {
          coopSettle: [
            [ownReq, ownConfirmation],
            [partnerReq, partnerConfirmation],
          ],
        },
        { tokenNetwork: action.meta.tokenNetwork, partner: action.meta.partner },
      );
    }),
    filter(isntNil),
  );
}
