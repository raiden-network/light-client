import constant from 'lodash/constant';
import findKey from 'lodash/findKey';
import type { Observable } from 'rxjs';
import { defer, EMPTY, merge, of } from 'rxjs';
import {
  catchError,
  filter,
  ignoreElements,
  mergeMap,
  mergeMapTo,
  raceWith,
  take,
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
import { checkContractHasMethod$ } from '../../utils/ethers';
import { retryWhile } from '../../utils/rx';
import type { Address } from '../../utils/types';
import { channelDeposit, channelOpen } from '../actions';
import { assertTx, channelKey, ensureApprovedBalance$ } from '../utils';

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
 * @param deps.getTokenContract - Token contract instance getter
 * @param deps.getTokenNetworkContract - TokenNetwork contract instance getter
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of channelOpen.failure actions
 */
export function channelOpenEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<channelOpen.failure | channelDeposit.request> {
  const { log, address, getTokenContract, getTokenNetworkContract, config$, latest$ } = deps;
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
        deps,
        action.payload.subkey ?? configSubkey,
      );
      const tokenNetworkContract = getContractWithSigner(
        getTokenNetworkContract(tokenNetwork),
        onchainSigner,
      );

      return checkContractHasMethod$(tokenNetworkContract, 'openChannelWithDeposit').pipe(
        catchError(constant(of(false))),
        mergeMap((hasMethod) => {
          const deposit = action.payload.deposit;
          const openedByPartner$ = action$.pipe(
            filter(channelOpen.success.is),
            filter((a) => a.meta.tokenNetwork === tokenNetwork && a.meta.partner === partner),
          );

          let deposit$: Observable<channelDeposit.request> = EMPTY;
          // in case we need to deposit and contract doesn't support 'openChannelWithDeposit'
          // method (legacy 0.37), emit channelDeposit.request with waitOpen=true, which will
          // ensureApprovedBalance$ (in parallel with open) and deposit once open tx is confirmed
          if (deposit?.gt(0))
            deposit$ = of(
              channelDeposit.request(
                { deposit, subkey: action.payload.subkey, waitOpen: true },
                action.meta,
              ),
            );

          if (deposit?.gt(0) && hasMethod) {
            const token = findKey(state.tokens, (tn) => tn === tokenNetwork)! as Address;
            const tokenContract = getContractWithSigner(getTokenContract(token), onchainSigner);
            // if we need to deposit and contract supports 'openChannelWithDeposit' (0.39+),
            // we must ensureApprovedBalance$ ourselves and then call the method to open+deposit
            return ensureApprovedBalance$(tokenContract, tokenNetwork, deposit, deps).pipe(
              mergeMap(async () =>
                tokenNetworkContract.openChannelWithDeposit(
                  address,
                  partner,
                  action.payload.settleTimeout ?? settleTimeout,
                  deposit,
                  { gasPrice },
                ),
              ),
              assertTx('openChannelWithDeposit', ErrorCodes.CNL_OPENCHANNEL_FAILED, deps),
              retryWhile(intervalFromConfig(config$), {
                onErrors: commonAndFailTxErrors,
                log: log.info,
              }),
              ignoreElements(), // ignore success so it's picked by channelEventsEpic
              // raceWith acts like takeUntil, but besides unsubscribing from retryWhile if channel
              // gets opened by partner, also requests channelDeposit then
              raceWith(openedByPartner$.pipe(take(1), mergeMapTo(deposit$))),
              catchError((error) => of(channelOpen.failure(error, action.meta))),
            );
          } else {
            return merge(
              deposit$,
              defer(async () =>
                tokenNetworkContract.openChannel(
                  address,
                  partner,
                  action.payload.settleTimeout ?? settleTimeout,
                  { gasPrice },
                ),
              ).pipe(
                assertTx('openChannel', ErrorCodes.CNL_OPENCHANNEL_FAILED, deps),
                // also retry txFailErrors on open$ only; deposit$ (if not EMPTY) is handled by
                // channelDepositEpic
                retryWhile(intervalFromConfig(config$), {
                  onErrors: commonAndFailTxErrors,
                  log: log.info,
                }),
                // ignore success so it's picked by channelEventsEpic
                ignoreElements(),
                // if channel gets opened while retrying (e.g. by partner), give up to avoid erroring
                takeUntil(openedByPartner$),
                catchError((error) => of(channelOpen.failure(error, action.meta))),
              ),
            );
          }
        }),
      );
    }),
  );
}
