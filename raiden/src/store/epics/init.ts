import { ofType } from 'redux-observable';
import { Observable, from, of, merge, interval, EMPTY } from 'rxjs';
import { map, mergeMap, withLatestFrom } from 'rxjs/operators';
import { isEmpty } from 'lodash';

import { Event } from 'ethers/contract';

import { fromEthersEvent, getEventsStream } from '../../utils';
import { RaidenEpicDeps } from '../../types';
import { RaidenState } from '../state';
import {
  RaidenActionType,
  RaidenActions,
  RaidenInitAction,
  NewBlockAction,
  TokenMonitoredAction,
  ChannelMonitoredAction,
  RaidenShutdownAction,
  ShutdownReason,
  raidenShutdown,
  newBlock,
  tokenMonitored,
  channelMonitored,
} from '../actions';

/**
 * Register for new block events and emit NewBlockActions for new blocks
 */
export const initNewBlockEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { provider }: RaidenEpicDeps,
): Observable<NewBlockAction> =>
  action$.pipe(
    ofType<RaidenActions, RaidenInitAction>(RaidenActionType.INIT),
    mergeMap(() => fromEthersEvent<number>(provider, 'block')),
    map(newBlock),
  );

/**
 * Monitor registry for token networks and monitor them
 */
export const initMonitorRegistryEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { registryContract, contractsInfo }: RaidenEpicDeps,
): Observable<TokenMonitoredAction> =>
  action$.pipe(
    ofType<RaidenActions, RaidenInitAction>(RaidenActionType.INIT),
    withLatestFrom(state$),
    mergeMap(([, state]) =>
      merge(
        // monitor old (in case of empty token2tokenNetwork) and new registered tokens
        // and starts monitoring every registered token
        getEventsStream<[string, string, Event]>(
          registryContract,
          [registryContract.filters.TokenNetworkCreated(null, null)],
          isEmpty(state.token2tokenNetwork)
            ? of(contractsInfo.TokenNetworkRegistry.block_number)
            : undefined,
          isEmpty(state.token2tokenNetwork) ? of(state.blockNumber) : undefined,
        ).pipe(
          withLatestFrom(state$),
          map(([[token, tokenNetwork], state]) =>
            tokenMonitored(token, tokenNetwork, !(token in state.token2tokenNetwork)),
          ),
        ),
        // monitor previously monitored tokens
        from(Object.entries(state.token2tokenNetwork)).pipe(
          map(([token, tokenNetwork]) => tokenMonitored(token, tokenNetwork)),
        ),
      ),
    ),
  );

/**
 * Monitor channels previously already on state
 */
export const initMonitorChannelsEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
): Observable<ChannelMonitoredAction> =>
  action$.pipe(
    ofType<RaidenActions, RaidenInitAction>(RaidenActionType.INIT),
    withLatestFrom(state$),
    mergeMap(function*([, state]) {
      for (const [tokenNetwork, obj] of Object.entries(state.tokenNetworks)) {
        for (const [partner, channel] of Object.entries(obj)) {
          if (channel.id !== undefined) {
            yield channelMonitored(tokenNetwork, partner, channel.id);
          }
        }
      }
    }),
  );

/**
 * Monitor provider to ensure account continues to be available and network stays the same
 */
export const initMonitorProviderEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { address, network, provider }: RaidenEpicDeps,
): Observable<RaidenShutdownAction> =>
  action$.pipe(
    ofType<RaidenActions, RaidenInitAction>(RaidenActionType.INIT),
    mergeMap(() => provider.listAccounts()),
    // at init time, check if our address is in provider's accounts list
    // if not, it means Signer is a local Wallet or another non-provider-side account
    // if yes, poll accounts every 1s and monitors if address is still there
    // also, every 1s poll current provider network and monitors if it's the same
    // if any check fails, emits RaidenShutdownAction, nothing otherwise
    // Poll reason from: https://github.com/MetaMask/faq/blob/master/DEVELOPERS.md
    // first/init-time check
    map(accounts => accounts.includes(address)),
    mergeMap(isProviderAccount =>
      interval(provider.pollingInterval).pipe(
        mergeMap(() =>
          merge(
            // if isProviderAccount, also polls and monitors accounts list
            isProviderAccount
              ? from(provider.listAccounts()).pipe(
                  mergeMap(accounts =>
                    !accounts.includes(address)
                      ? of(raidenShutdown(ShutdownReason.ACCOUNT_CHANGED))
                      : EMPTY,
                  ),
                )
              : EMPTY,
            // unconditionally monitors network changes
            from(provider.getNetwork()).pipe(
              mergeMap(curNetwork =>
                curNetwork.chainId !== network.chainId
                  ? of(raidenShutdown(ShutdownReason.NETWORK_CHANGED))
                  : EMPTY,
              ),
            ),
          ),
        ),
      ),
    ),
  );
