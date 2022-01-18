import { MaxUint256 } from '@ethersproject/constants';
import constant from 'lodash/constant';
import isEqual from 'lodash/isEqual';
import type { Observable } from 'rxjs';
import { EMPTY, merge, of } from 'rxjs';
import {
  catchError,
  concatWith,
  filter,
  first,
  groupBy,
  ignoreElements,
  mergeMap,
  pluck,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { intervalFromConfig } from '../../config';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isConfirmationResponseOf } from '../../utils/actions';
import { commonAndFailTxErrors, ErrorCodes, RaidenError } from '../../utils/error';
import { checkContractHasMethod$ } from '../../utils/ethers';
import { retryWhile } from '../../utils/rx';
import { channelDeposit, channelOpen } from '../actions';
import { channelKey, transact } from '../utils';

// check if contract supports `openChannelWithDeposit`, emit actions and catch error if needed
function openChannel$(
  action$: Observable<RaidenAction>,
  request: channelOpen.request,
  deps: RaidenEpicDeps,
) {
  const { address, getTokenNetworkContract, log, config$ } = deps;
  const tokenNetworkContract = getTokenNetworkContract(request.meta.tokenNetwork);
  return checkContractHasMethod$(tokenNetworkContract, 'openChannelWithDeposit').pipe(
    catchError(constant(of(false))),
    mergeMap((hasWithDepositMethod) => {
      let open$;
      if (request.payload.deposit?.gt(0) && hasWithDepositMethod) {
        // if contract supports `openChannelWithDeposit`; ensureApprovedBalance$ is performed by
        // parallel channelDeposit.request
        open$ = transact(
          tokenNetworkContract,
          'openChannelWithDeposit',
          [address, request.meta.partner, request.payload.deposit],
          deps,
          { subkey: null, error: ErrorCodes.CNL_OPENCHANNEL_FAILED },
        );
      } else {
        // if contract doesn't support `openChannelWithDeposit` or deposit isn't needed
        open$ = transact(
          tokenNetworkContract,
          'openChannel',
          [address, request.meta.partner],
          deps,
          { subkey: null, error: ErrorCodes.CNL_OPENCHANNEL_FAILED },
        );
      }
      return open$.pipe(
        retryWhile(intervalFromConfig(config$), {
          onErrors: commonAndFailTxErrors,
          log: log.info,
        }),
        // if channel gets opened while retrying (e.g. by partner), give up retry
        takeUntil(
          action$.pipe(
            filter(channelOpen.success.is),
            filter((a) => isEqual(a.meta, request.meta)),
          ),
        ),
        concatWith(action$.pipe(first(isConfirmationResponseOf(channelOpen, request.meta)))),
        ignoreElements(),
        catchError((error) => of(channelOpen.failure(error, request.meta))),
      );
    }),
  );
}

/**
 * A channelOpen action requested by user
 * Needs to be called on a previously monitored tokenNetwork. Calls TokenNetwork.openChannel
 * with given parameters. If tx goes through successfuly, stop as channelOpen.success action
 * will instead be detected and fired by channelEventsEpic. If anything detectable goes wrong,
 * fires a channelOpen.failure action instead
 *
 * @param action$ - Observable of channelOpen actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @returns Observable of channelOpen.failure actions
 */
export function channelOpenEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<channelOpen.failure | channelDeposit.request> {
  return action$.pipe(
    filter(channelOpen.request.is),
    withLatestFrom(deps.config$),
    // if minimumAllowance is default=big, we can relax the serialization to be per channel,
    // instead of per token, as parallel deposits in different channels won't conflict on allowance
    groupBy(([{ meta }, { minimumAllowance }]) =>
      minimumAllowance.eq(MaxUint256) ? channelKey(meta) : meta.tokenNetwork,
    ),
    mergeMap((grouped$) =>
      grouped$.pipe(
        pluck(0),
        withLatestFrom(state$),
        mergeMap(([action, state]) => {
          const channelState = state.channels[channelKey(action.meta)]?.state;
          // fails if channel already exist
          if (channelState)
            return of(
              channelOpen.failure(
                new RaidenError(ErrorCodes.CNL_INVALID_STATE, { state: channelState }),
                action.meta,
              ),
            );

          let deposit$: Observable<channelDeposit.request> = EMPTY;
          if (action.payload.deposit?.gt(0))
            // we request deposit regardless of method used; if openWithDeposit,
            // channelDeposit.request will ensureApprovedBalance$, and give up on the actual
            // deposit once the WithDeposit is detected
            deposit$ = of(
              channelDeposit.request(
                { totalDeposit: action.payload.deposit, waitOpen: true },
                action.meta,
              ),
            );

          return merge(deposit$, openChannel$(action$, action, deps));
        }),
      ),
    ),
  );
}
