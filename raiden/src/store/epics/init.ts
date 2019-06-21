import { Observable, from, of, merge, interval, EMPTY, throwError } from 'rxjs';
import {
  catchError,
  filter,
  map,
  mapTo,
  mergeMap,
  tap,
  toArray,
  withLatestFrom,
  startWith,
} from 'rxjs/operators';
import { isActionOf, ActionType } from 'typesafe-actions';
import { get, isEmpty, sortBy } from 'lodash';
import fetch from 'cross-fetch';

import { Event } from 'ethers/contract';
import { MatrixClient, createClient } from 'matrix-js-sdk';

import { Address } from '../../utils/types';
import { fromEthersEvent, getEventsStream, getNetwork } from '../../utils/ethers';
import { yamlListToArray, matrixRTT, getServerName } from '../../utils/matrix';
import { RaidenEpicDeps } from '../../types';
import { MATRIX_KNOWN_SERVERS_URL, ShutdownReason } from '../../constants';
import { RaidenAction } from '../../actions';
import { RaidenMatrixSetup } from '../../transport/state';
import { RaidenState } from '../state';
import { raidenInit, raidenShutdown } from '../actions';
import { newBlock, tokenMonitored, channelMonitored } from '../../channels/actions';
import { matrixSetup } from '../../transport/actions';

/**
 * Register for new block events and emit NewBlockActions for new blocks
 */
export const initNewBlockEpic = (
  action$: Observable<RaidenAction>,
  {  }: Observable<RaidenState>,
  { provider }: RaidenEpicDeps,
): Observable<ActionType<typeof newBlock>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
    mergeMap(() => fromEthersEvent<number>(provider, 'block')),
    map(blockNumber => newBlock({ blockNumber })),
  );

/**
 * Monitor registry for token networks and monitor them
 */
export const initMonitorRegistryEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { registryContract, contractsInfo }: RaidenEpicDeps,
): Observable<ActionType<typeof tokenMonitored>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
    withLatestFrom(state$),
    mergeMap(([, state]) =>
      merge(
        // monitor old (in case of empty token2tokenNetwork) and new registered tokens
        // and starts monitoring every registered token
        getEventsStream<[Address, Address, Event]>(
          registryContract,
          [registryContract.filters.TokenNetworkCreated(null, null)],
          isEmpty(state.token2tokenNetwork)
            ? of(contractsInfo.TokenNetworkRegistry.block_number)
            : undefined,
          isEmpty(state.token2tokenNetwork) ? of(state.blockNumber) : undefined,
        ).pipe(
          withLatestFrom(state$.pipe(startWith(state))),
          map(([[token, tokenNetwork], state]) =>
            tokenMonitored({
              token,
              tokenNetwork,
              first: !(token in state.token2tokenNetwork),
            }),
          ),
        ),
        // monitor previously monitored tokens
        from(Object.entries(state.token2tokenNetwork)).pipe(
          map(([token, tokenNetwork]) => tokenMonitored({ token, tokenNetwork })),
        ),
      ),
    ),
  );

/**
 * Monitor channels previously already on state
 */
export const initMonitorChannelsEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<ActionType<typeof channelMonitored>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
    withLatestFrom(state$),
    mergeMap(function*([, state]) {
      for (const [tokenNetwork, obj] of Object.entries(state.tokenNetworks)) {
        for (const [partner, channel] of Object.entries(obj)) {
          if (channel.id !== undefined) {
            yield channelMonitored({ id: channel.id }, { tokenNetwork, partner });
          }
        }
      }
    }),
  );

/**
 * Monitor provider to ensure account continues to be available and network stays the same
 */
export const initMonitorProviderEpic = (
  action$: Observable<RaidenAction>,
  {  }: Observable<RaidenState>,
  { address, network, provider }: RaidenEpicDeps,
): Observable<ActionType<typeof raidenShutdown>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
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
                      ? of(raidenShutdown({ reason: ShutdownReason.ACCOUNT_CHANGED }))
                      : EMPTY,
                  ),
                )
              : EMPTY,
            // unconditionally monitors network changes
            from(getNetwork(provider)).pipe(
              mergeMap(curNetwork =>
                curNetwork.chainId !== network.chainId
                  ? of(raidenShutdown({ reason: ShutdownReason.NETWORK_CHANGED }))
                  : EMPTY,
              ),
            ),
          ),
        ),
      ),
    ),
  );

/**
 * Initialize matrix transport
 */
export const initMatrixEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, network, signer, matrix$ }: RaidenEpicDeps,
): Observable<ActionType<typeof matrixSetup>> =>
  action$.pipe(
    filter(isActionOf(raidenInit)),
    withLatestFrom(state$),
    mergeMap(function([, state]) {
      const server: string | undefined = get(state, ['transport', 'matrix', 'server']),
        setup: RaidenMatrixSetup | undefined = get(state, ['transport', 'matrix', 'setup']);
      if (server) {
        // use server from state/settings
        return of({ server, setup });
      } else {
        const knownServersUrl =
          MATRIX_KNOWN_SERVERS_URL[network.name] || MATRIX_KNOWN_SERVERS_URL.default;
        // fetch servers list and use the one with shortest http round trip time (rtt)
        return from(fetch(knownServersUrl)).pipe(
          mergeMap(response => {
            if (!response.ok)
              return throwError(
                new Error(
                  `Could not fetch server list from "${knownServersUrl}" => ${response.status}`,
                ),
              );
            return response.text();
          }),
          mergeMap(text => from(yamlListToArray(text))),
          mergeMap(server => matrixRTT(server)),
          toArray(),
          map(rtts => sortBy(rtts, ['rtt'])),
          map(rtts => {
            if (!rtts[0] || typeof rtts[0].rtt !== 'number' || isNaN(rtts[0].rtt))
              throw new Error(`Could not contact any matrix servers: ${JSON.stringify(rtts)}`);
            return rtts[0].server;
          }),
          map(server => ({
            server: server.includes('://') ? server : `https://${server}`,
            setup: undefined,
          })),
        );
      }
    }),
    mergeMap(function({
      server,
      setup,
    }): Observable<{ matrix: MatrixClient; server: string; setup: RaidenMatrixSetup }> {
      let { userId, accessToken, deviceId }: Partial<RaidenMatrixSetup> = setup || {};
      if (setup) {
        // if matrixSetup was already issued before, and credentials are already in state
        const matrix = createClient({
          baseUrl: server,
          userId,
          accessToken,
          deviceId,
        });
        return of({ matrix, server, setup });
      } else {
        const serverName = getServerName(server);
        if (!serverName) return throwError(new Error(`Could not get serverName from "${server}"`));
        const matrix = createClient({ baseUrl: server });
        const userName = address.toLowerCase();
        userId = `@${userName}:${serverName}`;

        // create password as signature of serverName, then try login or register
        return from(signer.signMessage(serverName)).pipe(
          mergeMap(password =>
            from(matrix.loginWithPassword(userName, password)).pipe(
              catchError(() => from(matrix.register(userName, password))),
            ),
          ),
          tap(result => {
            // matrix.register implementation doesn't set returned credentials
            // which would require an unnecessary additional login request if we didn't
            // set it here, and login doesn't set deviceId, so we set all credential
            // parameters again here after successful login or register
            matrix.deviceId = result.device_id;
            matrix._http.opts.accessToken = result.access_token;
            matrix.credentials = {
              userId: result.user_id,
            };
            // set vars for later MatrixSetupAction
            accessToken = result.access_token;
            deviceId = result.device_id;
          }),
          // displayName must be signature of full userId for our messages to be accepted
          mergeMap(() => signer.signMessage(userId!)),
          map(signedUserId => ({
            matrix,
            server,
            setup: {
              userId: userId!,
              accessToken: accessToken!,
              deviceId: deviceId!,
              displayName: signedUserId,
            },
          })),
        );
      }
    }),
    mergeMap(({ matrix, server, setup }) =>
      // ensure displayName is set even on restarts
      from(matrix.setDisplayName(setup.displayName)).pipe(
        // ensure we joined discovery room
        mergeMap(() =>
          matrix.joinRoom(
            `#raiden_${network.name || network.chainId}_discovery:${getServerName(server)}`,
          ),
        ),
        mapTo({ matrix, server, setup }),
      ),
    ),
    tap(({ matrix }) => {
      // like Promise.resolve for AsyncSubjects
      matrix$.next(matrix);
      matrix$.complete();
    }),
    map(({ server, setup }) => matrixSetup({ server, setup })),
  );
