import type { Contract } from '@ethersproject/contracts';
import pick from 'lodash/pick';
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
  mapTo,
  mergeMap,
  mergeMapTo,
  pluck,
  scan,
  share,
  startWith,
  take,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import type { Channel } from '../../channels';
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
import { contractHasMethod } from '../../utils/ethers';
import { LruCache } from '../../utils/lru';
import { dispatchRequestAndGetResponse, retryWhile } from '../../utils/rx';
import { decode, HexString, Signed } from '../../utils/types';
import {
  withdraw,
  withdrawBusy,
  withdrawCompleted,
  withdrawExpire,
  withdrawMessage,
  withdrawResolve,
} from '../actions';
import { Direction } from '../state';
import { matchWithdraw, retrySendUntil$ } from './utils';

function withdrawMetaFromRequest(
  req: WithdrawRequest,
  channel: Channel,
): withdraw.request['meta'] {
  return {
    tokenNetwork: channel.tokenNetwork,
    partner: channel.partner.address,
    direction: req.participant === channel.partner.address ? Direction.RECEIVED : Direction.SENT,
    expiration: req.expiration.toNumber(),
    totalWithdraw: req.total_withdraw,
  };
}

// observable of true if valid, errors otherwise
function checkContractHasMethod$<C extends Contract>(
  contract: C,
  method: keyof C['functions'] & string,
): Observable<true> {
  return defer(async () => {
    const sighash = contract.interface.getSighash(method);
    // decode shouldn't fail if building with ^0.39 contracts, but runtime may be running
    // with 0.37 contracts, and the only way to know is by checking contract's code (memoized)
    assert(
      await contractHasMethod(decode(HexString(4), sighash, 'signature hash not found'), contract),
      ['contract does not have method', { contract: contract.address, method }],
    );
    return true as const;
  });
}

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
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.getTokenNetworkContract - TokenNetwork contract getter
 * @returns Observable of withdraw.request|withdraw.failure actions
 */
export function withdrawResolveEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { getTokenNetworkContract }: RaidenEpicDeps,
): Observable<matrixPresence.request | withdraw.request | withdraw.failure> {
  return action$.pipe(
    dispatchRequestAndGetResponse(matrixPresence, (requestPresence$) =>
      action$.pipe(
        filter(withdrawResolve.is),
        mergeMap((action) => {
          let preCheck$ = of(true);
          if (action.payload?.coopSettle) {
            const tokenNetworkContract = getTokenNetworkContract(action.meta.tokenNetwork);
            preCheck$ = checkContractHasMethod$(tokenNetworkContract, 'cooperativeSettle');
          }
          return preCheck$.pipe(
            mergeMapTo(
              requestPresence$(
                matrixPresence.request(undefined, { address: action.meta.partner }),
              ),
            ),
            map((presence) => {
              // assert shouldn't fail, because presence request would, but just in case
              assert(presence.payload.available, 'partner offline');
              return withdraw.request(action.payload, action.meta);
            }),
            catchError((err) => of(withdraw.failure(err, action.meta))),
          );
        }),
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
): Observable<withdraw.success | withdraw.failure | withdrawBusy> {
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
              const channel = state.channels[grouped$.key];
              assert(channel?.state === ChannelState.open, 'channel not open');
              const req = channel.own.pendingWithdraws.find(
                matchWithdraw(MessageType.WITHDRAW_REQUEST, action.payload.message),
              );
              assert(req, 'no matching WithdrawRequest found');

              // don't send withdraw tx if this is a coop_settle request (back or forth)
              if ('coop_settle' in req) return EMPTY;

              assert(
                action.meta.totalWithdraw.gt(channel.own.withdraw),
                'withdraw already performed',
              );

              // don't send on-chain tx if we're 'revealTimeout' blocks from expiration
              // this is our confidence threshold when we can get a tx inside timeout
              assert(
                req.expiration.gte(state.blockNumber + revealTimeout),
                ErrorCodes.CNL_WITHDRAW_EXPIRES_SOON,
              );

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
                startWith(withdrawBusy(undefined, action.meta)),
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

function withdrawKey(meta: withdraw.request['meta']) {
  return `${channelKey(meta)}|${meta.expiration}|${meta.totalWithdraw.toString()}`;
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
): Observable<withdrawExpire.request | withdraw.failure> {
  const alreadyFailed = new Set<string>();
  const busyWithdraws = new Set<string>();
  return action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    withLatestFrom(
      state$,
      config$,
      action$.pipe(
        filter(isActionOf([withdrawBusy, withdraw.success, withdraw.failure])),
        scan((acc, action) => {
          // a string representing uniquely this withdraw.meta
          const key = withdrawKey(action.meta);
          // 'busy' adds withdraw to set, preventing these withdraws from failing due to expiration
          // too soon; withdraw.success|failure clears it
          if (withdrawBusy.is(action)) acc.add(key);
          else acc.delete(key);
          return acc;
        }, busyWithdraws),
        startWith(busyWithdraws),
      ),
    ),
    mergeMap(function* ([
      blockNumber,
      state,
      { confirmationBlocks, revealTimeout },
      busyWithdraws,
    ]) {
      for (const channel of Object.values(state.channels)) {
        if (channel.state !== ChannelState.open) continue;
        const requestMessages = channel.own.pendingWithdraws.filter(
          matchWithdraw(MessageType.WITHDRAW_REQUEST),
        );
        for (const req of requestMessages) {
          // do not withdraw.failure early for withdraws currently being processed
          if (busyWithdraws.has(withdrawKey(withdrawMetaFromRequest(req, channel)))) continue;
          if (req.expiration.lt(state.blockNumber + revealTimeout)) {
            const coopSettleFailedKey = req.message_identifier.toHexString();
            if (!alreadyFailed.has(coopSettleFailedKey)) {
              alreadyFailed.add(coopSettleFailedKey);
              yield withdraw.failure(
                new RaidenError(ErrorCodes.CNL_WITHDRAW_EXPIRED),
                withdrawMetaFromRequest(req, channel),
              );
            }
          }
          if (
            req.expiration.lt(blockNumber + confirmationBlocks * 2) &&
            !channel.own.pendingWithdraws.some(matchWithdraw(MessageType.WITHDRAW_EXPIRED, req))
          )
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
        take(1),
        mapTo(withdrawCompleted(undefined, action.meta)),
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
 * @param deps.log - Logger instance
 * @param deps.getTokenNetworkContract - TokenNetwork contract getter
 * @returns Observable of withdraw.request(coop_settle=false) actions
 */
export function coopSettleWithdrawReplyEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, getTokenNetworkContract }: RaidenEpicDeps,
): Observable<withdraw.request> {
  return action$.pipe(
    filter(withdrawMessage.success.is),
    filter((action) => action.meta.direction === Direction.RECEIVED),
    withLatestFrom(state$),
    mergeMap(([action, state]) => {
      const tokenNetworkContract = getTokenNetworkContract(action.meta.tokenNetwork);
      return checkContractHasMethod$(tokenNetworkContract, 'cooperativeSettle').pipe(
        mergeMap(() => {
          const channel = state.channels[channelKey(action.meta)];
          assert(channel?.state === ChannelState.open, 'channel not open');
          const req = channel.partner.pendingWithdraws.find(
            matchWithdraw(MessageType.WITHDRAW_REQUEST, action.payload.message),
          );
          assert(req, 'no matching WithdrawRequest found'); // shouldn't happen

          // only reply if this is a coop settle request from partner
          if (!req.coop_settle) return EMPTY;

          const { ownTotalWithdrawable } = channelAmounts(channel);
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
        }),
        catchError((error) => {
          log.warn('Could not reply to CoopSettle request, ignoring', { action, error });
          return EMPTY;
        }),
      );
    }),
  );
}

/**
 * When both valid [[WithdrawConfirmation]] for a [[WithdrawRequest]].coop_settle=true from us,
 * send a channelSettle.request
 *
 * @param action$ - Observable of withdrawMessage.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @param deps.log - Logger instance
 * @returns Observable of channelSettle.request|withdraw.failure|success|withdrawBusy actions
 */
export function coopSettleEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { latest$, config$, log }: RaidenEpicDeps,
): Observable<channelSettle.request | withdraw.failure | withdraw.success | withdrawBusy> {
  return action$.pipe(
    dispatchRequestAndGetResponse(channelSettle, (requestSettle$) =>
      action$.pipe(
        filter(withdrawMessage.success.is),
        groupBy((action) => channelKey(action.meta)),
        mergeMap((grouped$) =>
          grouped$.pipe(
            concatMap((action) =>
              // observable inside concatMap ensures the body is evaluated at subscription time
              combineLatest([latest$, config$]).pipe(
                first(),
                mergeMap(([{ state }, { revealTimeout }]) => {
                  const channel = state.channels[channelKey(action.meta)];
                  if (channel?.state !== ChannelState.open) return EMPTY;

                  const {
                    ownCapacity,
                    partnerCapacity,
                    ownTotalWithdrawable,
                    partnerTotalWithdrawable,
                  } = channelAmounts(channel);
                  if (
                    channel.own.locks.length ||
                    channel.partner.locks.length ||
                    !ownCapacity.isZero() || // when both capacities are zero, both sides should be ready
                    !partnerCapacity.isZero()
                  )
                    return EMPTY;

                  const ownReq = channel.own.pendingWithdraws.find(
                    (msg): msg is Signed<WithdrawRequest> =>
                      msg.type === MessageType.WITHDRAW_REQUEST &&
                      msg.expiration.gte(state.blockNumber + revealTimeout) &&
                      msg.total_withdraw.eq(ownTotalWithdrawable) &&
                      !!msg.coop_settle, // only requests where coop_settle is true
                  );
                  if (!ownReq || ownReq.expiration.lt(state.blockNumber + revealTimeout))
                    return EMPTY; // not our request or expires too soon

                  const ownConfirmation = channel.own.pendingWithdraws.find(
                    matchWithdraw(MessageType.WITHDRAW_CONFIRMATION, ownReq),
                  );
                  const partnerReq = channel.partner.pendingWithdraws.find(
                    (msg): msg is Signed<WithdrawRequest> =>
                      msg.type === MessageType.WITHDRAW_REQUEST &&
                      msg.expiration.gte(state.blockNumber + revealTimeout) &&
                      msg.total_withdraw.eq(partnerTotalWithdrawable),
                  );
                  if (!partnerReq) return EMPTY; // shouldn't happen
                  const partnerConfirmation = channel.partner.pendingWithdraws.find(
                    matchWithdraw(MessageType.WITHDRAW_CONFIRMATION, partnerReq),
                  );
                  if (!ownConfirmation || !partnerConfirmation) {
                    log.info('no matching WithdrawConfirmations found', {
                      ownConfirmation,
                      partnerConfirmation,
                    });
                    return EMPTY;
                  }

                  const withdrawMeta = withdrawMetaFromRequest(ownReq, channel);
                  return requestSettle$(
                    channelSettle.request(
                      {
                        coopSettle: [
                          [ownReq, ownConfirmation],
                          [partnerReq, partnerConfirmation],
                        ],
                      },
                      { tokenNetwork: withdrawMeta.tokenNetwork, partner: withdrawMeta.partner },
                    ),
                  ).pipe(
                    map((success) =>
                      withdraw.success(
                        pick(success.payload, ['txBlock', 'txHash', 'confirmed'] as const),
                        withdrawMeta,
                      ),
                    ),
                    catchError((err) => of(withdraw.failure(err, withdrawMeta))),
                    // prevents this withdraw from expire-failing while we're trying to settle
                    startWith(withdrawBusy(undefined, withdrawMeta)),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
