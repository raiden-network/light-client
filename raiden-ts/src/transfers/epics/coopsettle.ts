import pick from 'lodash/pick';
import type { Observable } from 'rxjs';
import { combineLatest, EMPTY, of } from 'rxjs';
import {
  catchError,
  concatMap,
  filter,
  first,
  groupBy,
  map,
  mergeMap,
  startWith,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { ChannelState } from '../../channels';
import { channelSettle } from '../../channels/actions';
import { channelAmounts, channelKey } from '../../channels/utils';
import type { WithdrawRequest } from '../../messages';
import { MessageType } from '../../messages';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { assert } from '../../utils/error';
import { dispatchRequestAndGetResponse } from '../../utils/rx';
import type { Signed } from '../../utils/types';
import { withdraw, withdrawBusy, withdrawMessage } from '../actions';
import { Direction } from '../state';
import { checkContractHasMethod$, matchWithdraw, withdrawMetaFromRequest } from './utils';

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
                  assert(channel?.state === ChannelState.open, 'channel not open');

                  const {
                    ownCapacity,
                    partnerCapacity,
                    ownTotalWithdrawable,
                    partnerTotalWithdrawable,
                  } = channelAmounts(channel);
                  // when both capacities are zero, both sides should be ready; before that, just
                  // skip silently, a matching state may come later or withdraw will expire
                  assert(
                    (!channel.own.locks.length &&
                      !channel.partner.locks.length &&
                      ownCapacity.isZero()) ||
                      partnerCapacity.isZero(),
                    '',
                  );

                  const ownReq = channel.own.pendingWithdraws.find(
                    (msg): msg is Signed<WithdrawRequest> =>
                      msg.type === MessageType.WITHDRAW_REQUEST &&
                      msg.expiration.gte(state.blockNumber + revealTimeout) &&
                      msg.total_withdraw.eq(ownTotalWithdrawable) &&
                      !!msg.coop_settle, // only requests where coop_settle is true
                  );
                  // not our request or expires too soon
                  assert(ownReq && !ownReq.expiration.lt(state.blockNumber + revealTimeout), '');

                  const ownConfirmation = channel.own.pendingWithdraws.find(
                    matchWithdraw(MessageType.WITHDRAW_CONFIRMATION, ownReq),
                  );
                  const partnerReq = channel.partner.pendingWithdraws.find(
                    (msg): msg is Signed<WithdrawRequest> =>
                      msg.type === MessageType.WITHDRAW_REQUEST &&
                      msg.expiration.gte(state.blockNumber + revealTimeout) &&
                      msg.total_withdraw.eq(partnerTotalWithdrawable),
                  );
                  assert(partnerReq, 'partner request not found'); // shouldn't happen
                  const partnerConfirmation = channel.partner.pendingWithdraws.find(
                    matchWithdraw(MessageType.WITHDRAW_CONFIRMATION, partnerReq),
                  );
                  assert(ownConfirmation && partnerConfirmation, [
                    'no matching WithdrawConfirmations found',
                    { ownConfirmation, partnerConfirmation },
                  ]);

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
                catchError((err) => {
                  if (err.message) log.info(err.message, err.details);
                  // these errors are just the asserts, to be ignored;
                  // []actual errors are only the catched inside requestSettle$'s pipe
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
