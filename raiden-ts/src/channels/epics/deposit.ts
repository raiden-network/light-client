import { MaxUint256 } from '@ethersproject/constants';
import findKey from 'lodash/findKey';
import isEqual from 'lodash/isEqual';
import type { Observable } from 'rxjs';
import { of, ReplaySubject } from 'rxjs';
import {
  catchError,
  concatMap,
  concatWith,
  connect,
  filter,
  first,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  mergeMapTo,
  pluck,
  raceWith,
  take,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { intervalFromConfig } from '../../config';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isConfirmationResponseOf } from '../../utils/actions';
import { assert, commonAndFailTxErrors, ErrorCodes, RaidenError } from '../../utils/error';
import { completeWith, retryWhile } from '../../utils/rx';
import type { Address, UInt } from '../../utils/types';
import { isntNil } from '../../utils/types';
import { channelDeposit, channelOpen } from '../actions';
import type { Channel } from '../state';
import { ChannelState } from '../state';
import { channelKey, ensureApprovedBalance$, transact } from '../utils';

// returns observable of channel states, or errors in case of channelOpen.failure
function getChannel$(
  { meta }: channelDeposit.request,
  action$: Observable<RaidenAction>,
  { latest$ }: Pick<RaidenEpicDeps, 'latest$'>,
) {
  return latest$.pipe(
    pluck('state', 'channels', channelKey(meta)),
    filter(isntNil),
    raceWith(
      action$.pipe(
        filter(channelOpen.failure.is),
        filter((failure) => isEqual(failure.meta, meta)),
        map(() => {
          throw new RaidenError(ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND, meta);
        }),
      ),
    ),
  );
}

// returns tuple of [required funds/allowance, new total deposit to channel]
function getDeposits({ payload }: channelDeposit.request, channel?: Channel) {
  let deposit: UInt<32>;
  let totalDeposit: UInt<32>;
  if (!channel) {
    [deposit, totalDeposit] =
      'totalDeposit' in payload
        ? [payload.totalDeposit, payload.totalDeposit]
        : [payload.deposit, payload.deposit];
  } else if ('totalDeposit' in payload) {
    [deposit, totalDeposit] = [
      payload.totalDeposit.sub(channel.own.deposit) as UInt<32>,
      payload.totalDeposit,
    ];
  } else
    [deposit, totalDeposit] = [
      payload.deposit,
      channel.own.deposit.add(payload.deposit) as UInt<32>,
    ];
  assert(deposit.gt(0), ErrorCodes.DTA_INVALID_DEPOSIT);
  return [deposit, totalDeposit] as const;
}

// actually performs a deposit to new [totalDeposit]
function makeDeposit$(
  request: channelDeposit.request,
  channelId$: Observable<number>,
  [deposit, totalDeposit]: readonly [deposit: UInt<32>, totalDeposit: UInt<32>],
  deps: RaidenEpicDeps,
) {
  const { address, log, getTokenContract, getTokenNetworkContract, config$, latest$ } = deps;
  const { tokenNetwork, partner } = request.meta;
  // retryWhile from here
  return latest$.pipe(
    first(),
    mergeMap(({ state }) => {
      const token = findKey(state.tokens, (tn) => tn === tokenNetwork)! as Address;
      return ensureApprovedBalance$(getTokenContract(token), tokenNetwork, deposit, deps);
    }),
    mergeMapTo(channelId$),
    // send setTotalDeposit transaction
    mergeMap((id) =>
      transact(
        getTokenNetworkContract(tokenNetwork),
        'setTotalDeposit',
        [id, address, totalDeposit, partner],
        deps,
        { error: ErrorCodes.CNL_SETTOTALDEPOSIT_FAILED },
      ),
    ),
    // retry also txFail errors, since estimateGas can lag behind just-opened channel or
    // just-approved allowance
    retryWhile(intervalFromConfig(config$), { onErrors: commonAndFailTxErrors, log: log.info }),
  );
}

/**
 * A channelDeposit action requested by user or by channelOpenEpic
 * Needs to be called on a previously monitored channel. Calls Token.approve for TokenNetwork
 * and then set respective setTotalDeposit. If all tx go through successfuly, stop as
 * channelDeposit.success action will instead be detected and reacted by channelEventsEpic.
 * If anything detectable goes wrong, fires channelDeposit.failure instead
 * Fails immediately if channel doesn't exist or isn't open, unless payload.waitOpen is true, in
 * which case 'approve' in paralle and wait for confirmed channelOpen.success to 'setTotalDeposit'
 *
 * @param action$ - Observable of channelDeposit.request|channelOpen.failure actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.getTokenContract - Token contract instance getter
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.provider - Eth provider
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of channelDeposit.failure actions
 */
export function channelDepositEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<channelDeposit.failure> {
  return action$.pipe(
    filter(channelDeposit.request.is),
    withLatestFrom(deps.config$),
    // if minimumAllowance is default=big, we can relax the serialization to be per channel,
    // instead of per token, as parallel deposits in different channels won't conflict on allowance
    groupBy(([{ meta }, { minimumAllowance }]) =>
      minimumAllowance.eq(MaxUint256) ? channelKey(meta) : meta.tokenNetwork,
    ),
    mergeMap((grouped$) =>
      grouped$.pipe(
        pluck(0),
        // groupBy + concatMap ensure actions handling is serialized in a given tokenNetwork
        concatMap((action) =>
          deps.latest$.pipe(
            first(),
            mergeMap(({ state }) => {
              const channel = state.channels[channelKey(action.meta)];
              assert(
                (!channel && action.payload.waitOpen) || channel?.state === ChannelState.open,
                [ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND, { state: channel?.state, id: channel?.id }],
              );

              const channel$ = getChannel$(action, action$, deps);
              const [deposit, totalDeposit] = getDeposits(action, channel);

              return channel$.pipe(
                // 'cache' channelId$ (if needed) while waiting for 'approve';
                // also, subscribe early to error if seeing channelOpen.failure
                connect(
                  (channel$) =>
                    // already start 'approve' even while waiting for 'channel$'
                    makeDeposit$(
                      action,
                      channel$.pipe(pluck('id'), take(1)),
                      [deposit, totalDeposit],
                      deps,
                    ).pipe(
                      // hold this _lock_ (concatMap) until deposit has been confirmed or failed
                      concatWith(
                        action$.pipe(
                          filter(isConfirmationResponseOf(channelDeposit, action.meta)),
                          first(
                            (a) =>
                              !channelDeposit.success.is(a) ||
                              a.payload.totalDeposit.gte(totalDeposit),
                          ),
                        ),
                      ),
                      // complete on confirmation
                      takeUntil(
                        channel$.pipe(filter((channel) => channel.own.deposit.gte(totalDeposit))),
                      ),
                    ),
                  { connector: () => new ReplaySubject(1) },
                ),
                // ignore success tx so it's picked by channelEventsEpic
                ignoreElements(),
              );
            }),
            catchError((error) => of(channelDeposit.failure(error, action.meta))),
          ),
        ),
      ),
    ),
    completeWith(action$),
  );
}
