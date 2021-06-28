import * as t from 'io-ts';
import constant from 'lodash/constant';
import sortBy from 'lodash/sortBy';
import type { Filter, LoginPayload, MatrixClient } from 'matrix-js-sdk';
import { createClient } from 'matrix-js-sdk';
import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';
import type { Observable } from 'rxjs';
import { combineLatest, defer, EMPTY, from, merge, of, throwError } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import {
  catchError,
  concatMap,
  delayWhen,
  endWith,
  filter,
  first,
  ignoreElements,
  map,
  mapTo,
  mergeMap,
  retryWhen,
  take,
  tap,
  throwIfEmpty,
  timeout,
  toArray,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { intervalFromConfig } from '../../config';
import { RAIDEN_DEVICE_ID } from '../../constants';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { assert } from '../../utils';
import { ErrorCodes, networkErrors, RaidenError } from '../../utils/error';
import { getServerName } from '../../utils/matrix';
import { completeWith, lastMap, pluckDistinct, retryWhile } from '../../utils/rx';
import { decode } from '../../utils/types';
import { matrixSetup } from '../actions';
import type { RaidenMatrixSetup } from '../state';

/**
 * Creates and returns a matrix filter. The filter reduces the size of the initial sync by
 * filtering out broadcast rooms, emphemeral messages like receipts etc.
 *
 * @param matrix - The {@link MatrixClient} instance used to create the filter.
 * @param notRooms - The ids of the rooms to filter out during sync.
 * @returns Observable of the {@link Filter} that was created.
 */
async function createMatrixFilter(matrix: MatrixClient, notRooms: string[] = []): Promise<Filter> {
  const roomFilter = {
    not_rooms: notRooms,
    ephemeral: {
      not_types: ['m.receipt', 'm.typing'],
    },
    timeline: {
      limit: 0,
      not_senders: [matrix.getUserId()!],
    },
  };
  const filterDefinition = {
    room: roomFilter,
  };
  return matrix.createFilter(filterDefinition);
}

function startMatrixSync(
  action$: Observable<RaidenAction>,
  matrix: MatrixClient,
  { matrix$, config$, init$ }: Pick<RaidenEpicDeps, 'matrix$' | 'config$' | 'init$'>,
) {
  return action$.pipe(
    filter(matrixSetup.is),
    take(1),
    tap(() => {
      matrix$.next(matrix);
      matrix$.complete();
    }),
    mergeMap(() =>
      defer(async () =>
        Promise.all([
          createMatrixFilter(matrix),
          matrix.setPushRuleEnabled('global', 'override', '.m.rule.master', true),
        ]),
      ).pipe(
        // delay startClient (going online) to after raiden is synced
        delayWhen(() => init$.pipe(ignoreElements(), endWith(true))),
        mergeMap(async ([filter]) => matrix.startClient({ filter })),
        retryWhile(intervalFromConfig(config$), { onErrors: networkErrors, maxRetries: 3 }),
      ),
    ),
    ignoreElements(),
  );
}

/**
 * Given a server name (schema defaults to https:// and is prepended if missing), returns HTTP GET
 * round trip time (time to response)
 *
 * @param server - Server name with or without schema
 * @param httpTimeout - Optional timeout for the HTTP request
 * @returns Promise to a { server, rtt } object, where `rtt` may be NaN
 */
function matrixRTT$(
  server: string,
  httpTimeout: number,
): Observable<{ server: string; rtt: number }> {
  if (!server.includes('://')) server = 'https://' + server;
  return defer(() => {
    const start = Date.now();
    return fromFetch(server + '/_matrix/client/versions').pipe(
      timeout(httpTimeout),
      map(({ ok }) => (ok ? Date.now() : NaN)),
      catchError(() => of(NaN)),
      map((end) => ({ server, rtt: end - start })),
    );
  });
}

const MatrixServerInfo = t.type({
  active_servers: t.array(t.string),
  all_servers: t.array(t.string),
});

/**
 * Returns an observable of servers, sorted by response time
 *
 * @param matrixServerLookup - URL containing an YAML list of servers url
 * @param httpTimeout - httpTimeout to limit queries
 * @returns Observable of { server, rtt } objects, emitted in increasing rtt order
 */
function fetchSortedMatrixServers$(matrixServerLookup: string, httpTimeout: number) {
  return fromFetch(matrixServerLookup).pipe(
    mergeMap(async (response) => {
      assert(
        response.ok,
        `Could not fetch server list from "${matrixServerLookup}" => ${response.status}`,
      );
      return response.json();
    }),
    timeout(httpTimeout),
    mergeMap((data) => decode(MatrixServerInfo, data).active_servers),
    mergeMap((server) => matrixRTT$(server, httpTimeout)),
    toArray(),
    mergeMap((rtts) => sortBy(rtts, ['rtt'])),
    filter(({ rtt }) => !isNaN(rtt)),
    throwIfEmpty(() => new RaidenError(ErrorCodes.TRNS_NO_MATRIX_SERVERS)),
  );
}

/**
 * Validate and setup a MatrixClient connected to server, possibly using previous 'setup' data
 * May error if anything goes wrong.
 *
 * @param server - server URL, with schema
 * @param setup - optional previous setup/credentials data
 * @param deps - RaidenEpicDeps-like/partial object
 * @param deps.address - Our address (to compose matrix user)
 * @param deps.signer - Signer to be used to sign password and displayName
 * @param deps.config$ - Config observable
 * @returns Observable of one { matrix, server, setup } object
 */
function setupMatrixClient$(
  server: string,
  setup: RaidenMatrixSetup | undefined,
  { address, signer, config$ }: Pick<RaidenEpicDeps, 'address' | 'signer' | 'config$'>,
) {
  const homeserver = getServerName(server);
  assert(homeserver, [ErrorCodes.TRNS_NO_SERVERNAME, { server }]);

  return config$.pipe(
    first(),
    mergeMap(({ pollingInterval }) => {
      if (setup) {
        // if matrixSetup was already issued before, and credentials are already in state
        const matrix = createClient({
          baseUrl: server,
          userId: setup.userId,
          accessToken: setup.accessToken,
          deviceId: setup.deviceId,
        });
        return of({ matrix, server, setup, pollingInterval });
      } else {
        const matrix = createClient({ baseUrl: server });
        const username = address.toLowerCase();
        const userId = `@${username}:${homeserver}`;

        // create password as signature of serverName, then try login or register
        return from(signer.signMessage(homeserver)).pipe(
          mergeMap((password) =>
            defer(async () =>
              matrix.login('m.login.password', {
                identifier: { type: 'm.id.user', user: username },
                password,
                device_id: RAIDEN_DEVICE_ID,
              }),
            ).pipe(
              catchError(async (err) => {
                return matrix
                  .registerRequest({
                    username,
                    password,
                    device_id: RAIDEN_DEVICE_ID,
                  })
                  .catch(constant(err)) as Promise<LoginPayload>;
                // if register fails, throws login error as it's more informative
              }),
              retryWhile(intervalFromConfig(config$), { onErrors: networkErrors }),
            ),
          ),
          mergeMap(({ access_token, device_id, user_id }) => {
            assert(user_id === userId, ['Wrong login/register user_id', { user_id, userId }]);
            // matrix.register implementation doesn't set returned credentials
            // which would require an unnecessary additional login request if we didn't
            // set it here, and login doesn't set deviceId, so we set all credential
            // parameters again here after successful login or register
            matrix.deviceId = device_id;
            matrix._http.opts.accessToken = access_token;
            matrix.credentials = { userId };

            // displayName must be signature of full userId for our messages to be accepted
            return from(signer.signMessage(userId)).pipe(
              map((signedUserId) => ({
                matrix,
                server,
                setup: {
                  userId,
                  accessToken: access_token,
                  deviceId: device_id,
                  displayName: signedUserId,
                },
              })),
            );
          }),
        );
      }
    }),
    // the APIs below are authenticated, and therefore also act as validator
    mergeMap(({ matrix, server, setup }) =>
      // set these properties before starting sync
      defer(async () => matrix.setDisplayName(setup.displayName)).pipe(
        retryWhile(intervalFromConfig(config$), { onErrors: networkErrors }),
        mapTo({ matrix, server, setup }), // return triplet again
      ),
    ),
  );
}

/**
 * Initialize matrix transport
 * The matrix client instance will be outputed to RaidenEpicDeps.matrix$ AsyncSubject
 * The setup info (including credentials, for persistence) will be the matrixSetup output action
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.address - Our address
 * @param deps.signer - Signer instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @param deps.init$ - Init$ tasks subject
 * @returns Observable of matrixSetup generated by initializing matrix client
 */
export function initMatrixEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<matrixSetup> {
  const { matrix$, latest$, config$, init$ } = deps;
  return combineLatest([latest$, config$]).pipe(
    first(), // at startup
    mergeMap(([{ state }, { matrixServer, matrixServerLookup, httpTimeout }]) => {
      const server = state.transport.server,
        setup = state.transport.setup;
      // when matrix$ async subject completes, transport init task is completed
      init$.next(matrix$);

      const servers$Array: Observable<{ server: string; setup?: RaidenMatrixSetup }>[] = [];

      if (matrixServer) {
        // if config.matrixServer is set, we must use it (possibly re-using stored credentials,
        // if matching), not fetch from lookup address
        if (matrixServer === server) servers$Array.push(of({ server, setup }));
        // even if same server, also append without setup to retry if auth fails
        servers$Array.push(of({ server: matrixServer }));
      } else {
        // previously used server
        if (server) servers$Array.push(of({ server, setup }));

        // fetched servers list
        // notice it may include stored server again, but no stored setup, which could be the
        // cause of the  first failure, so we allow it to try again (not necessarily first)
        servers$Array.push(fetchSortedMatrixServers$(matrixServerLookup, httpTimeout));
      }

      let lastError: Error;
      const andSuppress = (err: Error) => ((lastError = err), EMPTY);

      // on [re-]subscription (defer), pops next observable and subscribe to it
      return defer(() => servers$Array.shift() || EMPTY).pipe(
        catchError(andSuppress), // servers$ may error, so store lastError
        concatMap(({ server, setup }) =>
          // serially, try setting up client and validate its credential
          setupMatrixClient$(server, setup, deps).pipe(
            // store and suppress any 'setupMatrixClient$' error
            catchError(andSuppress),
          ),
        ),
        // on first setupMatrixClient$'s success, emit, complete and unsubscribe
        first(),
        tap(({ matrix }) => matrix.setMaxListeners(30)),
        // with errors suppressed, only possible error here is 'no element in sequence'
        retryWhen((err$) =>
          // if there're more servers$ observables in queue, emit once to retry from defer;
          // else, errors output with lastError to unsubscribe
          err$.pipe(mergeMap(() => (servers$Array.length ? of(null) : throwError(lastError)))),
        ),
      );
    }),
    // on success
    mergeMap(({ matrix, server, setup }) =>
      merge(
        // wait for matrixSetup through reducer, then resolves matrix$ with client and starts it
        startMatrixSync(action$, matrix, deps),
        // emit matrixSetup in parallel to be persisted in state
        of(matrixSetup({ server, setup })),
        // monitor config.logger & disable or re-enable matrix's logger accordingly
        config$.pipe(
          pluckDistinct('logger'),
          tap((logger) => matrixLogger.setLevel(logger || 'silent', false)),
          ignoreElements(),
        ),
      ),
    ),
    completeWith(action$),
  );
}

/**
 * Calls matrix.stopClient when raiden is shutting down, i.e. action$ completes
 *
 * @param action$ - Observable of matrixSetup actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.matrix$ - MatrixClient async subject
 * @returns Empty observable (whole side-effect on matrix instance)
 */
export function matrixShutdownEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<RaidenAction> {
  return action$.pipe(
    withLatestFrom(matrix$),
    lastMap(async (pair) => {
      if (!pair) return;
      const matrix = pair[1];
      matrix.stopClient();
      try {
        await matrix.setPresence({ presence: 'offline', status_msg: '' });
      } catch (err) {}
    }),
    ignoreElements(),
  );
}
