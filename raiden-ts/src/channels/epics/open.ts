import type { Observable } from 'rxjs';
import { concat, defer, EMPTY, of } from 'rxjs';
import {
  catchError,
  filter,
  ignoreElements,
  mergeMap,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { intervalFromConfig } from '../../config';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { commonAndFailTxErrors, ErrorCodes, RaidenError } from '../../utils/error';
import { retryWhile } from '../../utils/rx';
import { channelDeposit, channelOpen } from '../actions';
import { assertTx, channelKey } from '../utils';

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
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.address - Our address
 * @param deps.main - Main signer/address
 * @param deps.provider - Provider instance
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of channelOpen.failure actions
 */
export function channelOpenEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  {
    log,
    signer,
    address,
    main,
    provider,
    getTokenNetworkContract,
    config$,
    latest$,
  }: RaidenEpicDeps,
): Observable<channelOpen.failure | channelDeposit.request> {
  return action$.pipe(
    filter(isActionOf(channelOpen.request)),
    withLatestFrom(state$, config$, latest$),
    mergeMap(([action, state, { settleTimeout, subkey: configSubkey }, { gasPrice }]) => {
      const { tokenNetwork, partner } = action.meta;
      const channelState = state.channels[channelKey(action.meta)]?.state;
      // fails if channel already exist
      if (channelState)
        return of(
          channelOpen.failure(
            new RaidenError(ErrorCodes.CNL_INVALID_STATE, { state: channelState }),
            action.meta,
          ),
        );
      const { signer: onchainSigner } = chooseOnchainAccount(
        { signer, address, main },
        action.payload.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );

      let deposit$: Observable<channelDeposit.request> = EMPTY;
      if (action.payload.deposit?.gt(0))
        // if it didn't fail so far, emit a channelDeposit.request in parallel with waitOpen=true
        // to send 'approve' tx meanwhile we open the channel
        deposit$ = of(
          channelDeposit.request(
            { deposit: action.payload.deposit, subkey: action.payload.subkey, waitOpen: true },
            action.meta,
          ),
        );

      return concat(
        deposit$,
        defer(async () =>
          tokenNetworkContract.openChannel(
            address,
            partner,
            action.payload.settleTimeout ?? settleTimeout,
            { gasPrice },
          ),
        ).pipe(
          assertTx('openChannel', ErrorCodes.CNL_OPENCHANNEL_FAILED, { log, provider }),
          // also retry txFailErrors: if it's caused by partner having opened, takeUntil will see
          retryWhile(intervalFromConfig(config$), {
            onErrors: commonAndFailTxErrors,
            log: log.info,
          }),
          // if channel gets opened while retrying (e.g. by partner), give up to avoid erroring
          takeUntil(
            action$.pipe(
              filter(channelOpen.success.is),
              filter(
                (action_) =>
                  action_.meta.tokenNetwork === tokenNetwork && action_.meta.partner === partner,
              ),
            ),
          ),
          // ignore success so it's picked by channelEventsEpic
          ignoreElements(),
          catchError((error) => of(channelOpen.failure(error, action.meta))),
        ),
      );
    }),
  );
}
