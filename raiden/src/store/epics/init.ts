import { ofType } from 'redux-observable';
import { Observable, from, of, merge, interval, EMPTY, throwError } from 'rxjs';
import { catchError, map, mapTo, mergeMap, tap, toArray, withLatestFrom } from 'rxjs/operators';
import { get, isEmpty, sortBy } from 'lodash';
import fetch from 'cross-fetch';

import { Event } from 'ethers/contract';
import { createClient } from 'matrix-js-sdk';

import {
  fromEthersEvent,
  getEventsStream,
  getNetwork,
  yamlListToArray,
  matrixRTT,
  getServerName,
} from '../../utils';
import { RaidenEpicDeps } from '../../types';
import { MATRIX_KNOWN_SERVERS_URL } from '../../constants';
import { RaidenState, RaidenMatrix } from '../state';
import {
  RaidenActionType,
  RaidenActions,
  RaidenInitAction,
  NewBlockAction,
  TokenMonitoredAction,
  ChannelMonitoredAction,
  MatrixSetupAction,
  RaidenShutdownAction,
  ShutdownReason,
  raidenShutdown,
  newBlock,
  tokenMonitored,
  channelMonitored,
  matrixSetup,
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
            from(getNetwork(provider)).pipe(
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

/**
 * Initialize matrix transport
 */
export const initMatrixEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { address, network, signer, matrix$ }: RaidenEpicDeps,
): Observable<MatrixSetupAction> =>
  action$.pipe(
    ofType<RaidenActions, RaidenInitAction>(RaidenActionType.INIT),
    withLatestFrom(state$),
    mergeMap(
      ([, state]): Observable<Partial<RaidenMatrix>> => {
        const setup: RaidenMatrix | undefined = get(state, ['transport', 'matrix']);
        if (setup) {
          // use server from state
          return of(setup);
        } else {
          const knownServersUrl =
            MATRIX_KNOWN_SERVERS_URL[network.name] || MATRIX_KNOWN_SERVERS_URL.default;
          // fetch servers list and use the one with shortest http round trip time (rtt)
          return from(fetch(knownServersUrl)).pipe(
            mergeMap(response => response.text()),
            mergeMap(text => from(yamlListToArray(text))),
            mergeMap(server => matrixRTT(server)),
            toArray(),
            map(rtts => sortBy(rtts, ['rtt'])),
            map(rtts => {
              if (!rtts[0] || !rtts[0].rtt)
                throw new Error(`Could not contact any matrix servers: ${rtts}`);
              return rtts[0].server;
            }),
            map(server => ({ server })),
          );
        }
      },
    ),
    mergeMap(setup => {
      let server: string = setup.server!,
        userId: string | undefined = setup.userId,
        accessToken: string | undefined = setup.accessToken,
        deviceId: string | undefined = setup.deviceId,
        displayName: string | undefined = setup.displayName;
      if (userId && accessToken && deviceId && displayName) {
        // if matrixSetup was already issued before, and credentials are already in state
        const matrix = createClient({
          baseUrl: server,
          userId,
          accessToken,
          deviceId,
        });
        return of({ matrix, setup: { server, userId, accessToken, deviceId, displayName } });
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
              mergeMap(result =>
                // assert returned userId is the expected one
                result.user_id === userId
                  ? of(result)
                  : throwError(
                      new Error(
                        `Invalid login or register user_id: expected "${userId}", got "${
                          result.user_id
                        }"`,
                      ),
                    ),
              ),
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
            // start client
            matrix.startClient({ initialSyncLimit: 0 });
          }),
          // displayName must be signature of full userId for our messages to be accepted
          mergeMap(() => signer.signMessage(userId!)),
          map(signedUserId => ({
            matrix,
            setup: {
              server,
              userId: userId!,
              accessToken: accessToken!,
              deviceId: deviceId!,
              displayName: signedUserId,
            },
          })),
        );
      }
    }),
    mergeMap(({ matrix, setup }) =>
      // ensure displayName is set even on restarts
      from(matrix.setDisplayName(setup.displayName)).pipe(
        // ensure we joined discovery room
        mergeMap(() => matrix.joinRoom(`raiden_${network.name || network.chainId}_discovery`)),
        mapTo({ matrix, setup }),
      ),
    ),
    tap(({ matrix }) => {
      // like Promise.resolve for AsyncSubjects
      matrix$.next(matrix);
      matrix$.complete();
    }),
    map(({ setup }) => matrixSetup(setup)),
  );
