import constant from 'lodash/constant';
import findKey from 'lodash/findKey';
import type { Observable } from 'rxjs';
import { EMPTY, merge, of } from 'rxjs';
import {
  catchError,
  filter,
  first,
  ignoreElements,
  mapTo,
  mergeMap,
  raceWith,
  take,
  takeUntil,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { intervalFromConfig } from '../../config';
import type { HumanStandardToken, TokenNetwork } from '../../contracts';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { commonAndFailTxErrors, ErrorCodes, RaidenError } from '../../utils/error';
import { checkContractHasMethod$ } from '../../utils/ethers';
import { retryWhile } from '../../utils/rx';
import type { Address, UInt } from '../../utils/types';
import { channelDeposit, channelOpen } from '../actions';
import { assertTx, channelKey, ensureApprovedBalance$ } from '../utils';

// if contract supports `openChannelWithDeposit`
function openWithDeposit$(
  [tokenNetworkContract, tokenContract]: readonly [TokenNetwork, HumanStandardToken],
  [partner, deposit, settleTimeout, raced$]: readonly [
    Address,
    UInt<32>,
    number,
    Observable<unknown>,
  ],
  deps: RaidenEpicDeps,
): Observable<boolean> {
  const { address, latest$, config$, log } = deps;
  const tokenNetwork = tokenNetworkContract.address as Address;
  // if we need to deposit and contract supports 'openChannelWithDeposit' (0.39+),
  // we must ensureApprovedBalance$ ourselves and then call the method to open+deposit
  return ensureApprovedBalance$(tokenContract, tokenNetwork, deposit, deps).pipe(
    withLatestFrom(latest$),
    mergeMap(async ([, { gasPrice }]) =>
      tokenNetworkContract.openChannelWithDeposit(address, partner, settleTimeout, deposit, {
        gasPrice,
      }),
    ),
    assertTx('openChannelWithDeposit', ErrorCodes.CNL_OPENCHANNEL_FAILED, deps),
    retryWhile(intervalFromConfig(config$), {
      onErrors: commonAndFailTxErrors,
      log: log.info,
    }),
    mapTo(false), // should not deposit, as tx succeeded
    // raceWith acts like takeUntil, but besides unsubscribing from retryWhile if channel
    // gets opened by partner, also requests channelDeposit then
    raceWith(raced$.pipe(take(1), mapTo(true))), // should deposit, as open raced
  );
}

// if contract doesn't support `openChannelWithDeposit` or deposit isn't needed
function openAndThenDeposit$(
  tokenNetworkContract: TokenNetwork,
  [partner, settleTimeout, raced$]: readonly [Address, number, Observable<unknown>],
  deps: RaidenEpicDeps,
) {
  const { address, log, latest$, config$ } = deps;
  return merge(
    of(true), // should deposit in parallel (approve + deposit[waitOpen])
    latest$.pipe(
      first(),
      mergeMap(async ({ gasPrice }) =>
        tokenNetworkContract.openChannel(address, partner, settleTimeout, { gasPrice }),
      ),
      assertTx('openChannel', ErrorCodes.CNL_OPENCHANNEL_FAILED, deps),
      // also retry txFailErrors on open$ only; deposit$ (if not EMPTY) is handled by
      // channelDepositEpic
      retryWhile(intervalFromConfig(config$), {
        onErrors: commonAndFailTxErrors,
        log: log.info,
      }),
      ignoreElements(), // ignore success so it's picked by channelEventsEpic
      // if channel gets opened while retrying (e.g. by partner), give up retry
      takeUntil(raced$),
    ),
  );
}

// check if contract supports `openChannelWithDeposit`, emit actions and catch error if needed
function openAndDeposit$(
  action$: Observable<RaidenAction>,
  request: channelOpen.request,
  [tokenNetworkContract, tokenContract]: [TokenNetwork, HumanStandardToken],
  deps: RaidenEpicDeps,
) {
  const deposit = request.payload.deposit;
  const { tokenNetwork, partner } = request.meta;
  const { config$ } = deps;
  return checkContractHasMethod$(tokenNetworkContract, 'openChannelWithDeposit').pipe(
    catchError(constant(of(false))),
    withLatestFrom(config$),
    mergeMap(([hasMethod, { settleTimeout: configSettleTimeout }]) => {
      const openedByPartner$ = action$.pipe(
        filter(channelOpen.success.is),
        filter((a) => a.meta.tokenNetwork === tokenNetwork && a.meta.partner === partner),
      );
      const settleTimeout = request.payload.settleTimeout ?? configSettleTimeout;

      let open$: Observable<boolean>;
      if (deposit?.gt(0) && hasMethod) {
        open$ = openWithDeposit$(
          [tokenNetworkContract, tokenContract],
          [partner, deposit, settleTimeout, openedByPartner$],
          deps,
        );
      } else {
        open$ = openAndThenDeposit$(
          tokenNetworkContract,
          [partner, settleTimeout, openedByPartner$],
          deps,
        );
      }
      return open$.pipe(
        mergeMap((shouldDeposit) =>
          shouldDeposit && deposit?.gt(0)
            ? of(
                channelDeposit.request(
                  { deposit, subkey: request.payload.subkey, waitOpen: true },
                  request.meta,
                ),
              )
            : EMPTY,
        ),
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
  const { getTokenNetworkContract, getTokenContract, config$ } = deps;
  return action$.pipe(
    filter(isActionOf(channelOpen.request)),
    withLatestFrom(state$, config$),
    mergeMap(([action, state, { subkey: configSubkey }]) => {
      const { tokenNetwork } = action.meta;
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
      const token = findKey(state.tokens, (tn) => tn === tokenNetwork)! as Address;
      const tokenContract = getContractWithSigner(getTokenContract(token), onchainSigner);

      return openAndDeposit$(action$, action, [tokenNetworkContract, tokenContract], deps);
    }),
  );
}
