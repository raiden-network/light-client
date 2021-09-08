import findKey from 'lodash/findKey';
import type { Observable } from 'rxjs';
import { combineLatest, merge, of, ReplaySubject } from 'rxjs';
import {
  catchError,
  concatMap,
  connect,
  filter,
  first,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  mergeMapTo,
  pluck,
  take,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { intervalFromConfig } from '../../config';
import type { HumanStandardToken, TokenNetwork } from '../../contracts';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { assert, commonAndFailTxErrors, ErrorCodes, RaidenError } from '../../utils/error';
import { mergeWith, retryWhile } from '../../utils/rx';
import type { Address, UInt } from '../../utils/types';
import { isntNil } from '../../utils/types';
import { channelDeposit, channelOpen } from '../actions';
import { ChannelState } from '../state';
import { assertTx, channelKey, ensureApprovedBalance$ } from '../utils';

function makeDeposit$(
  [tokenContract, tokenNetworkContract]: [HumanStandardToken, TokenNetwork],
  [partner, channelId$]: readonly [Address, Observable<number>],
  deposit: UInt<32>,
  deps: Pick<RaidenEpicDeps, 'address' | 'log' | 'config$' | 'latest$'>,
) {
  const { address, log, config$, latest$ } = deps;
  const provider = tokenContract.provider as RaidenEpicDeps['provider'];
  // retryWhile from here
  return ensureApprovedBalance$(
    tokenContract,
    tokenNetworkContract.address as Address,
    deposit,
    deps,
  ).pipe(
    mergeMapTo(channelId$),
    // get current 'view' of own/'address' deposit, despite any other pending deposits
    mergeWith(
      async (id) =>
        (await tokenNetworkContract.callStatic.getChannelParticipantInfo(id, address, partner))[0],
    ),
    withLatestFrom(latest$),
    // send setTotalDeposit transaction
    mergeMap(async ([[id, totalDeposit], { gasPrice }]) =>
      tokenNetworkContract.setTotalDeposit(id, address, totalDeposit.add(deposit), partner, {
        gasPrice,
      }),
    ),
    assertTx('setTotalDeposit', ErrorCodes.CNL_SETTOTALDEPOSIT_FAILED, { log, provider }),
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
  const { signer, address, main, getTokenContract, getTokenNetworkContract, config$, latest$ } =
    deps;
  return action$.pipe(
    filter(isActionOf(channelDeposit.request)),
    groupBy((action) => action.meta.tokenNetwork),
    mergeMap((grouped$) =>
      grouped$.pipe(
        // groupBy + concatMap ensure actions handling is serialized in a given tokenNetwork
        concatMap((action) =>
          combineLatest([latest$, config$]).pipe(
            first(),
            mergeMap(([{ state }, { subkey: configSubkey }]) => {
              assert(action.payload.deposit.gt(0), ErrorCodes.DTA_INVALID_DEPOSIT);
              const { tokenNetwork, partner } = action.meta;

              const token = findKey(state.tokens, (tn) => tn === tokenNetwork)! as Address;
              const channel = state.channels[channelKey(action.meta)];
              let channel$;
              if (token && !channel && action.payload.waitOpen)
                channel$ = merge(
                  // throw if channelOpen.failure goes through
                  action$.pipe(
                    filter(channelOpen.failure.is),
                    filter(
                      (failure) =>
                        failure.meta.tokenNetwork === action.meta.tokenNetwork &&
                        failure.meta.partner === action.meta.partner,
                    ),
                    map(() => {
                      throw new RaidenError(ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND, action.meta);
                    }),
                  ),
                  // wait for channel to become available
                  latest$.pipe(
                    pluck('state', 'channels', channelKey(action.meta)),
                    filter(isntNil),
                  ),
                );
              else if (channel?.state === ChannelState.open) channel$ = of(channel);
              else throw new RaidenError(ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND);

              const { signer: onchainSigner } = chooseOnchainAccount(
                { signer, address, main },
                action.payload.subkey ?? configSubkey,
              );
              const tokenContract = getContractWithSigner(getTokenContract(token), onchainSigner);
              const tokenNetworkContract = getContractWithSigner(
                getTokenNetworkContract(tokenNetwork),
                onchainSigner,
              );

              return channel$.pipe(
                pluck('id'),
                // 'cache' channelId$ (if needed) while waiting for 'approve';
                // also, subscribe early to error if seeing channelOpen.failure
                connect(
                  (channelId$) =>
                    // already start 'approve' even while waiting for 'channel$'
                    makeDeposit$(
                      [tokenContract, tokenNetworkContract],
                      [partner, channelId$.pipe(take(1))],
                      action.payload.deposit,
                      deps,
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
  );
}
