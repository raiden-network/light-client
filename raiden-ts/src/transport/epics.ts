/* eslint-disable @typescript-eslint/camelcase */
import {
  Observable,
  combineLatest,
  from,
  of,
  EMPTY,
  fromEvent,
  timer,
  throwError,
  merge,
  defer,
  concat,
  AsyncSubject,
} from 'rxjs';
import {
  catchError,
  concatMap,
  delay,
  distinctUntilChanged,
  filter,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  withLatestFrom,
  scan,
  startWith,
  switchMap,
  take,
  takeUntil,
  tap,
  toArray,
  mapTo,
  finalize,
  first,
  timeout,
  pluck,
  repeatWhen,
  exhaustMap,
  throwIfEmpty,
  retryWhen,
} from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { find, minBy, sortBy } from 'lodash';

import { getAddress, verifyMessage } from 'ethers/utils';

import {
  createClient,
  MatrixClient,
  MatrixEvent,
  Room,
  RoomMember,
  RoomFilterJson,
  FilterDefinition,
  Filter,
} from 'matrix-js-sdk';
import matrixLogger from 'matrix-js-sdk/lib/logger';

import RaidenError, { ErrorCodes } from '../utils/error';
import { Address, Signed, isntNil, assert, Signature } from '../utils/types';
import { isActionOf } from '../utils/actions';
import { RaidenEpicDeps } from '../types';
import { RaidenAction } from '../actions';
import { channelMonitor } from '../channels/actions';
import { RaidenConfig } from '../config';
import {
  Message,
  MessageType,
  Delivered,
  Processed,
  SecretRequest,
  SecretReveal,
} from '../messages/types';
import {
  decodeJsonMessage,
  encodeJsonMessage,
  getMessageSigner,
  signMessage,
} from '../messages/utils';
import { messageSend, messageReceived, messageGlobalSend } from '../messages/actions';
import { transferSigned } from '../transfers/actions';
import { RaidenState } from '../state';
import { getServerName, getUserPresence } from '../utils/matrix';
import { LruCache } from '../utils/lru';
import { pluckDistinct } from '../utils/rx';
import { matrixRoom, matrixRoomLeave, matrixSetup, matrixPresence } from './actions';
import { RaidenMatrixSetup } from './state';
import { getRoom$, roomMatch, globalRoomNames } from './utils';

// unavailable just means the user didn't do anything over a certain amount of time, but they're
// still there, so we consider the user as available/online then
const AVAILABLE = ['online', 'unavailable'];
const userRe = /^@(0x[0-9a-f]{40})[.:]/i;

/**
 * Joins the global broadcast rooms and returns the room ids.
 *
 * @param config - The {@link RaidenConfig} provides the broadcast room aliases for pfs and discovery.
 * @param matrix - The {@link MatrixClient} instance used to create the filter.
 * @returns Observable of the list of room ids for the the broadcast rooms.
 */
function joinGlobalRooms(config: RaidenConfig, matrix: MatrixClient): Observable<string[]> {
  const serverName = getServerName(matrix.baseUrl)!;
  return from(globalRoomNames(config)).pipe(
    map(globalRoom => `#${globalRoom}:${serverName}`),
    mergeMap(alias =>
      matrix.joinRoom(alias).then(room => {
        // set alias in room state directly
        // this trick is needed because global rooms aren't synced
        room.currentState.setStateEvents([
          new MatrixEvent({
            type: 'm.room.aliases',
            state_key: serverName,
            content: { aliases: [alias] },
            event_id: `$local_${Date.now()}`,
            room_id: room.roomId,
            sender: matrix.getUserId()!,
          }),
        ]);
        matrix.store.storeRoom(room);
        return room;
      }),
    ),
    pluck('roomId'),
    toArray(),
  );
}

/**
 * Creates and returns a matrix filter. The filter reduces the size of the initial sync by
 * filtering out broadcast rooms, emphemeral messages like receipts etc.
 *
 * @param matrix - The {@link MatrixClient} instance used to create the filter.
 * @param roomIds - The ids of the rooms to filter out during sync.
 * @returns Observable of the {@link Filter} that was created.
 */
function createFilter(matrix: MatrixClient, roomIds: string[]): Observable<Filter> {
  return defer(() => {
    const roomFilter: RoomFilterJson = {
      not_rooms: roomIds,
      ephemeral: {
        not_types: ['m.receipt', 'm.typing'],
      },
      state: {
        lazy_load_members: true,
      },
      timeline: {
        limit: 0,
      },
    };
    const filterDefinition: FilterDefinition = {
      room: roomFilter,
    };
    return matrix.createFilter(filterDefinition);
  });
}

function startMatrixSync(
  action$: Observable<RaidenAction>,
  matrix: MatrixClient,
  matrix$: AsyncSubject<MatrixClient>,
  config$: Observable<RaidenConfig>,
) {
  return action$.pipe(
    filter(matrixSetup.is),
    take(1),
    tap(() => {
      matrix$.next(matrix);
      matrix$.complete();
    }),
    delay(1e3), // wait 1s before starting matrix, so event listeners can be registered
    withLatestFrom(config$),
    mergeMap(([, config]) =>
      joinGlobalRooms(config, matrix).pipe(
        mergeMap(roomIds => createFilter(matrix, roomIds)),
        mergeMap(filter => matrix.startClient({ filter })),
      ),
    ),
    ignoreElements(),
  );
}

/**
 * Search user directory for valid users matching a given address and return latest
 *
 * @param matrix - Matrix client to search users from
 * @param address - Address of interest
 * @param log - Logger object
 * @returns Observable of user with most recent presence
 */
function searchAddressPresence$(
  matrix: MatrixClient,
  address: Address,
  { log }: { log: RaidenEpicDeps['log'] },
) {
  return defer(() =>
    // search for any user containing the address of interest in its userId
    matrix.searchUserDirectory({ term: address.toLowerCase() }),
  ).pipe(
    // for every result matches, verify displayName signature is address of interest
    mergeMap(function*({ results }) {
      for (const user of results) {
        if (!user.display_name) continue;
        try {
          const match = userRe.exec(user.user_id);
          if (!match || getAddress(match[1]) !== address) continue;
          const recovered = verifyMessage(user.user_id, user.display_name);
          if (!recovered || recovered !== address) continue;
        } catch (err) {
          continue;
        }

        yield user.user_id;
      }
    }),
    mergeMap(userId =>
      getUserPresence(matrix, userId)
        .then(presence => ({ ...presence, user_id: userId }))
        .catch(err => {
          log.info('Error fetching user presence, ignoring:', err);
          return undefined;
        }),
    ),
    filter(isntNil),
    toArray(),
    // for all matched/verified users, get its presence through dedicated API
    // it's required because, as the user events could already have been handled
    // and filtered out by matrixPresenceUpdateEpic because it wasn't yet a
    // user-of-interest, we could have missed presence updates, then we need to
    // fetch it here directly, and from now on, that other epic will monitor its
    // updates, and sort by most recently seen user
    map(presences => {
      if (!presences.length) throw new RaidenError(ErrorCodes.TRNS_NO_VALID_USER, [{ address }]);
      return minBy(presences, 'last_active_ago')!;
    }),
  );
}

/**
 * Returns an observable which keeps inviting userId to roomId while user doesn't join
 *
 * If user already joined, completes immediatelly.
 *
 * @param matrix - client instance
 * @param roomId - room to invite user to
 * @param userId - user to be invited
 * @param config$ - Observable of config object containing httpTimeout used as iteration delay
 * @returns Cold observable which keep inviting user if needed and then completes.
 */
function inviteLoop$(
  matrix: MatrixClient,
  roomId: string,
  userId: string,
  config$: Observable<{ httpTimeout: number }>,
  { log }: { log: RaidenEpicDeps['log'] },
) {
  return defer(() => {
    const room = matrix.getRoom(roomId);
    return room
      ? // use room already present in matrix instance
        of(room)
      : // wait for room
        fromEvent<Room>(matrix, 'Room').pipe(
          filter(room => room.roomId === roomId),
          take(1),
        );
  }).pipe(
    // stop if user already a room member
    filter(room => {
      const member = room.getMember(userId);
      return !member || member.membership !== 'join';
    }),
    withLatestFrom(config$),
    mergeMap(([, { httpTimeout }]) =>
      // defer here ensures invite is re-done on repeat (re-subscription)
      defer(() => matrix.invite(roomId, userId)).pipe(
        // while shouldn't stop (by unsubscribe or takeUntil)
        repeatWhen(completed$ => completed$.pipe(delay(httpTimeout))),
        catchError(err => {
          log.warn('Error inviting', err);
          return EMPTY;
        }),
        takeUntil(
          // stop repeat+defer loop above when user joins
          fromEvent<RoomMember>(
            matrix,
            'RoomMember.membership',
            ({}: MatrixEvent, member: RoomMember) => member,
          ).pipe(
            filter(
              member =>
                member.roomId === roomId &&
                member.userId === userId &&
                member.membership === 'join',
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * From a yaml list string, return as Array
 * E.g. yamlListToArray(`
 * # comment
 *   - test1
 *   - test2
 *   - test3
 * `) === ['test1', 'test2', 'test3']
 *
 * @param yml - String containing only YAML list
 * @returns List of strings inside yml-encoded text
 */
function yamlListToArray(yml: string): string[] {
  // match all strings starting with optional spaces followed by a dash + space
  // capturing only the content of the list item, trimming spaces
  const reg = /^\s*-\s*(.+?)\s*$/gm;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = reg.exec(yml))) {
    results.push(match[1]);
  }
  return results;
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
      map(end => ({ server, rtt: end - start })),
    );
  });
}

/**
 * Returns an observable of servers, sorted by response time
 *
 * @param matrixServerLookup - URL containing an YAML list of servers url
 * @param httpTimeout - httpTimeout to limit queries
 * @returns Observable of { server, rtt } objects, emitted in increasing rtt order
 */
function fetchSortedMatrixServers$(matrixServerLookup: string, httpTimeout: number) {
  return fromFetch(matrixServerLookup).pipe(
    mergeMap(async response => {
      assert(
        response.ok,
        `Could not fetch server list from "${matrixServerLookup}" => ${response.status}`,
      );
      return response.text();
    }),
    timeout(httpTimeout),
    mergeMap(text => yamlListToArray(text)),
    mergeMap(server => matrixRTT$(server, httpTimeout)),
    toArray(),
    mergeMap(rtts => sortBy(rtts, ['rtt'])),
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
 * @returns Observable of one { matrix, server, setup } object
 */
function setupMatrixClient$(
  server: string,
  setup: RaidenMatrixSetup | undefined,
  {
    address,
    signer,
  }: {
    address: RaidenEpicDeps['address'];
    signer: RaidenEpicDeps['signer'];
  },
) {
  const serverName = getServerName(server);
  if (!serverName) throw new RaidenError(ErrorCodes.TRNS_NO_SERVERNAME, [{ server }]);

  return defer(() => {
    if (setup) {
      // if matrixSetup was already issued before, and credentials are already in state
      const matrix = createClient({
        baseUrl: server,
        userId: setup.userId,
        accessToken: setup.accessToken,
        deviceId: setup.deviceId,
      });
      return of({ matrix, server, setup });
    } else {
      const matrix = createClient({ baseUrl: server });
      const userName = address.toLowerCase(),
        userId = `@${userName}:${serverName}`;

      // create password as signature of serverName, then try login or register
      return from(signer.signMessage(serverName)).pipe(
        mergeMap(password =>
          from(matrix.loginWithPassword(userName, password)).pipe(
            catchError(() => matrix.register(userName, password)),
          ),
        ),
        mergeMap(({ access_token, device_id }) => {
          // matrix.register implementation doesn't set returned credentials
          // which would require an unnecessary additional login request if we didn't
          // set it here, and login doesn't set deviceId, so we set all credential
          // parameters again here after successful login or register
          matrix.deviceId = device_id;
          matrix._http.opts.accessToken = access_token;
          matrix.credentials = { userId };

          // displayName must be signature of full userId for our messages to be accepted
          return from(signer.signMessage(userId)).pipe(
            map(signedUserId => ({
              matrix,
              server,
              setup: {
                userId,
                accessToken: access_token,
                deviceId: device_id,
                displayName: signedUserId,
              } as RaidenMatrixSetup,
            })),
          );
        }),
      );
    }
  }).pipe(
    // the APIs below are authenticated, and therefore also act as validator
    mergeMap(({ matrix, server, setup }) =>
      // ensure displayName is set even on restarts
      from(matrix.setDisplayName(setup.displayName)).pipe(
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
 * @param address,network,signer,matrix$ - RaidenEpicDeps members
 * @returns Observable of matrixSetup generated by initializing matrix client
 */
export const initMatrixEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, signer, matrix$, config$ }: RaidenEpicDeps,
): Observable<matrixSetup> =>
  combineLatest([state$, config$]).pipe(
    first(), // at startup
    mergeMap(([state, { matrixServer, matrixServerLookup, httpTimeout }]) => {
      const server = state.transport.matrix?.server,
        setup = state.transport.matrix?.setup;

      const servers$Array: Observable<{ server: string; setup?: RaidenMatrixSetup }>[] = [];

      if (matrixServer) {
        // if config.matrixServer is set, we must use it (possibly re-using stored credentials,
        // if matching), not fetch from lookup address
        if (matrixServer === server) servers$Array.push(of({ server, setup }));
        else servers$Array.push(of({ server: matrixServer }));
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
          setupMatrixClient$(server, setup, { address, signer }).pipe(
            // store and suppress any 'setupMatrixClient$' error
            catchError(andSuppress),
          ),
        ),
        // on first setupMatrixClient$'s success, emit, complete and unsubscribe
        first(),
        // with errors suppressed, only possible error here is 'no element in sequence'
        retryWhen(err$ =>
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
        startMatrixSync(action$, matrix, matrix$, config$),
        // emit matrixSetup in parallel to be persisted in state
        of(matrixSetup({ server, setup })),
        // monitor config.logger & disable or re-enable matrix's logger accordingly
        config$.pipe(
          pluckDistinct('logger'),
          tap(logger => matrixLogger.setLevel(logger || 'silent')),
          ignoreElements(),
        ),
      ),
    ),
  );

/**
 * Calls matrix.stopClient when raiden is shutting down, i.e. action$ completes
 *
 * @param action$ - Observable of matrixSetup actions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Empty observable (whole side-effect on matrix instance)
 */
export const matrixShutdownEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<RaidenAction> =>
  matrix$.pipe(
    mergeMap(matrix => action$.pipe(finalize(() => matrix.stopClient()))),
    ignoreElements(), // dont re-emit action$, but keep it subscribed so finalize works
  );

/**
 * Handles MatrixRequestMonitorPresenceAction and emits a MatrixPresenceUpdateAction
 * If presence is already known, emits it, else fetch from user profile
 * Even if the presence stays the same, we emit a MatrixPresenceUpdateAction, as this may be a
 * request being waited by a promise or something like that
 * IOW: every request should be followed by a presence update or a failed action, but presence
 * updates may happen later without new requests (e.g. when the user goes offline)
 *
 * @param action$ - Observable of matrixPresence.request actions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of presence updates or fail action
 */
export const matrixMonitorPresenceEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, latest$, log }: RaidenEpicDeps,
): Observable<matrixPresence.success | matrixPresence.failure> =>
  action$.pipe(
    filter(isActionOf(matrixPresence.request)),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
    groupBy(({ action }) => action.meta.address),
    mergeMap(grouped$ =>
      grouped$.pipe(
        withLatestFrom(latest$.pipe(pluckDistinct('presences'))),
        // if we're already fetching presence for this address, no need to fetch again
        exhaustMap(([{ action, matrix }, presences]) =>
          action.meta.address in presences
            ? // we already monitored/saw this user's presence
              of(presences[action.meta.address])
            : searchAddressPresence$(matrix, action.meta.address, { log }).pipe(
                map(({ presence, user_id: userId }) =>
                  matrixPresence.success(
                    { userId, available: AVAILABLE.includes(presence), ts: Date.now() },
                    action.meta,
                  ),
                ),
                catchError(err => of(matrixPresence.failure(err, action.meta))),
              ),
        ),
      ),
    ),
  );

/**
 * Monitor peers matrix presence from User.presence events
 * We aggregate all users of interest (i.e. for which a monitor request was emitted at some point)
 * and emit presence updates for any presence change happening to a user validating to this address
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of presence updates
 */
export const matrixPresenceUpdateEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, matrix$, latest$ }: RaidenEpicDeps,
): Observable<matrixPresence.success> =>
  matrix$.pipe(
    // when matrix finishes initialization, register to matrix presence events
    switchMap(matrix =>
      // matrix's 'User.presence' sometimes fail to fire, but generic 'event' is always fired,
      // and User (retrieved via matrix.getUser) is up-to-date before 'event' emits
      fromEvent<MatrixEvent>(matrix, 'event').pipe(map(event => ({ event, matrix }))),
    ),
    filter(({ event }) => event.getType() === 'm.presence'),
    // parse peer address from userId
    map(({ event, matrix }) => {
      // as 'event' is emitted after user is (created and) updated, getUser always returns it
      const user = matrix.getUser(event.getSender());
      if (!user || !user.presence) return;
      const match = userRe.exec(user.userId),
        peerAddress = match && match[1];
      if (!peerAddress) return;
      // getAddress will convert any valid address into checksummed-format
      const address = getAddress(peerAddress) as Address | undefined;
      if (!address) return;
      return { matrix, user, address };
    }),
    // filter out events without userId in the right format (startWith hex-address)
    filter(isntNil),
    withLatestFrom(
      // observable of all addresses whose presence monitoring was requested since init
      action$.pipe(
        filter(isActionOf(matrixPresence.request)),
        scan((toMonitor, request) => toMonitor.add(request.meta.address), new Set<Address>()),
        startWith(new Set<Address>()),
      ),
      // known presences as { address: <last seen MatrixPresenceUpdateAction> } mapping
      latest$.pipe(pluckDistinct('presences')),
    ),
    // filter out events from users we don't care about
    // i.e.: presence monitoring never requested
    filter(([{ address }, toMonitor]) => toMonitor.has(address)),
    mergeMap(([{ matrix, user, address }, , presences]) => {
      // first filter can't tell typescript this property will always be set!
      const userId = user.userId,
        presence = user.presence!,
        available = AVAILABLE.includes(presence);

      if (
        address in presences &&
        presences[address].payload.userId === userId &&
        presences[address].payload.available === available
      )
        // even if signature verification passes, this wouldn't change presence, so return early
        return EMPTY;

      // fetch profile info if user have no valid displayName set
      const displayName$: Observable<string | undefined> = Signature.is(user.displayName)
        ? of(user.displayName)
        : defer(() => matrix.getProfileInfo(userId, 'displayname')).pipe(
            pluck('displayname'),
            catchError(() => of(undefined)),
          );

      return displayName$.pipe(
        map(displayName => {
          // errors raised here will be logged and ignored on catchError below
          if (!displayName) throw new RaidenError(ErrorCodes.TRNS_NO_DISPLAYNAME, [{ userId }]);
          // ecrecover address, validating displayName is the signature of the userId
          const recovered = verifyMessage(userId, displayName) as Address | undefined;
          if (!recovered || recovered !== address)
            throw new RaidenError(ErrorCodes.TRNS_USERNAME_VERIFICATION_FAILED, [
              { userId, receivedSignature: recovered! },
            ]);
          return recovered;
        }),
        // TODO: edge case: don't emit unavailable if address is available somewhere else
        map(address =>
          matrixPresence.success(
            { userId, available, ts: user.lastPresenceTs ?? Date.now() },
            { address },
          ),
        ),
        catchError(err => (log.debug('Error validating presence event, ignoring', err), EMPTY)),
      );
    }),
  );

/**
 * Create room (if needed) for a transfer's target, channel's partner or, as a fallback, for any
 * recipient of a messageSend.request action
 *
 * @param action$ - Observable of transferSigned|channelMonitor|messageSend.request actions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of matrixRoom actions
 */
export const matrixCreateRoomEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, latest$ }: RaidenEpicDeps,
): Observable<matrixRoom> =>
  // actual output observable, selects addresses of interest from actions
  action$.pipe(
    // ensure there's a room for address of interest for each of these actions
    filter(isActionOf([transferSigned, channelMonitor, messageSend.request])),
    map(action =>
      isActionOf(transferSigned, action)
        ? action.payload.message.target
        : isActionOf(channelMonitor, action)
        ? action.meta.partner
        : action.meta.address,
    ),
    // groupby+mergeMap ensures different addresses are processed in parallel, and also
    // prevents one stuck address observable (e.g. presence delayed) from holding whole queue
    groupBy(address => address),
    mergeMap(grouped$ =>
      grouped$.pipe(
        // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
        mergeMap(address => matrix$.pipe(map(matrix => ({ address, matrix })))),
        // exhaustMap is used to prevent bursts of actions for a given address (eg. on startup)
        // of creating multiple rooms for same address, so we ignore new address items while
        // previous is being processed. If user roams, matrixInviteEpic will re-invite
        exhaustMap(({ address, matrix }) =>
          // presencesStateReplay$+take(1) acts like withLatestFrom with cached result
          latest$.pipe(
            // wait for user to be monitored
            filter(({ presences }) => address in presences),
            take(1),
            // if there's already a room in state for address, skip
            filter(({ state }) => !state.transport.matrix?.rooms?.[address]?.[0]),
            // else, create a room, invite known user and persist roomId in state
            mergeMap(({ presences }) =>
              matrix.createRoom({
                visibility: 'private',
                invite: [presences[address].payload.userId],
              }),
            ),
            map(({ room_id: roomId }) => matrixRoom({ roomId }, { address })),
          ),
        ),
      ),
    ),
  );

/**
 * Invites users coming online to main room we may have with them
 *
 * This also keeps retrying inviting every config.httpTimeout (default=30s) while user doesn't
 * accept our invite or don't invite or write to us to/in another room.
 *
 * @param action$ - Observable of matrixPresence.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps
 * @param deps.matrix$ - MatrixClient AsyncSubject
 * @param deps.config$ - RaidenConfig BehaviorSubject
 * @returns Empty observable (whole side-effect on matrix instance)
 */
export const matrixInviteEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, config$, latest$, log }: RaidenEpicDeps,
): Observable<RaidenAction> =>
  action$.pipe(
    filter(isActionOf(matrixPresence.success)),
    groupBy(a => a.meta.address),
    mergeMap(grouped$ =>
      // grouped$ is one observable of presence actions per partners address
      grouped$.pipe(
        // action comes only after matrix$ is started, so it's safe to use withLatestFrom
        withLatestFrom(matrix$),
        // switchMap on new presence action for address
        switchMap(([action, matrix]) =>
          !action.payload.available
            ? // if not available, do nothing (and unsubscribe from previous observable)
              EMPTY
            : latest$.pipe(
                pluckDistinct('state'),
                map(state => state.transport.matrix?.rooms?.[action.meta.address]?.[0]),
                distinctUntilChanged(),
                switchMap(roomId =>
                  concat(
                    of(roomId),
                    !roomId
                      ? EMPTY
                      : // re-trigger invite loop if user leaves
                        fromEvent<RoomMember>(
                          matrix,
                          'RoomMember.membership',
                          ({}: MatrixEvent, member: RoomMember) => member,
                        ).pipe(
                          filter(
                            member =>
                              member.roomId === roomId &&
                              member.userId === action.payload.userId &&
                              member.membership === 'leave',
                          ),
                          mapTo(roomId),
                        ),
                  ),
                ),
                // switchMap on main roomId change
                switchMap(roomId =>
                  !roomId
                    ? // if roomId not set, do nothing and unsubscribe
                      EMPTY
                    : // while subscribed and user didn't join, invite every httpTimeout=30s
                      inviteLoop$(matrix, roomId, action.payload.userId, config$, { log }),
                ),
              ),
        ),
      ),
    ),
    ignoreElements(),
  );

/**
 * Handle invites sent to us and accepts them iff sent by a monitored user
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of matrixRoom actions
 */
export const matrixHandleInvitesEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, config$, latest$ }: RaidenEpicDeps,
): Observable<matrixRoom> =>
  matrix$.pipe(
    // when matrix finishes initialization, register to matrix invite events
    switchMap(matrix =>
      fromEvent<{ event: MatrixEvent; member: RoomMember; matrix: MatrixClient }>(
        matrix,
        'RoomMember.membership',
        (event, member) => ({ event, member, matrix }),
      ),
    ),
    filter(
      // filter for invite events to us
      ({ member, matrix }) =>
        member.userId === matrix.getUserId() && member.membership === 'invite',
    ),
    withLatestFrom(config$),
    mergeMap(([{ event, member, matrix }, { httpTimeout }]) => {
      const sender = event.getSender(),
        senderPresence$ = latest$.pipe(
          pluckDistinct('presences'),
          map(presences => find(presences, p => p.payload.userId === sender)),
          filter(isntNil),
          take(1),
          // Don't wait more than some arbitrary time for this sender presence update to show
          // up; completes without emitting anything otherwise, ending this pipeline.
          // This also works as a filter to continue processing invites only for monitored
          // users, as it'll complete without emitting if no MatrixPresenceUpdateAction is
          // found for sender in time
          takeUntil(timer(httpTimeout)),
        );
      return senderPresence$.pipe(map(senderPresence => ({ matrix, member, senderPresence })));
    }),
    mergeMap(({ matrix, member, senderPresence }) =>
      // join room and emit MatrixRoomAction to make it default/first option for sender address
      from(matrix.joinRoom(member.roomId, { syncRoom: true })).pipe(
        map(() => matrixRoom({ roomId: member.roomId }, { address: senderPresence.meta.address })),
      ),
    ),
  );

/**
 * Leave any excess room for a partner when creating or joining a new one.
 * Excess rooms are LRU beyond a given threshold (configurable, default=3) in address's rooms
 * queue and are checked (only) when a new one is added to it.
 *
 * @param action$ - Observable of matrixRoom actions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of matrixRoomLeave actions
 */
export const matrixLeaveExcessRoomsEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { matrix$, config$ }: RaidenEpicDeps,
): Observable<matrixRoomLeave> =>
  action$.pipe(
    // act whenever a new room is added to the address queue in state
    filter(isActionOf(matrixRoom)),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
    withLatestFrom(state$, config$),
    mergeMap(([{ action, matrix }, state, { matrixExcessRooms }]) => {
      const rooms = state.transport!.matrix!.rooms![action.meta.address];
      return from(rooms.filter(({}, i) => i >= matrixExcessRooms)).pipe(
        mergeMap(roomId => matrix.leave(roomId).then(() => roomId)),
        map(roomId => matrixRoomLeave({ roomId }, action.meta)),
      );
    }),
  );

/**
 * Leave any room which is neither global nor known as a room for some user of interest
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Empty observable (whole side-effect on matrix instance)
 */
export const matrixLeaveUnknownRoomsEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { matrix$, config$ }: RaidenEpicDeps,
): Observable<RaidenAction> =>
  matrix$.pipe(
    // when matrix finishes initialization, register to matrix Room events
    switchMap(matrix =>
      fromEvent<Room>(matrix, 'Room').pipe(map(room => ({ matrix, roomId: room.roomId }))),
    ),
    delay(180e3), // this room may become known later for some reason, so wait a little
    withLatestFrom(state$, config$),
    // filter for leave events to us
    filter(([{ matrix, roomId }, state, config]) => {
      const room = matrix.getRoom(roomId);
      if (!room) return false; // room already gone while waiting
      const globalRooms = globalRoomNames(config);
      if (room.name && globalRooms.some(g => room.name.match(`#${g}:`))) return false;
      const rooms = state.transport.matrix?.rooms ?? {};
      for (const address in rooms) {
        for (const roomId of rooms[address]) {
          if (roomId === room.roomId) return false;
        }
      }
      return true;
    }),
    mergeMap(([{ matrix, roomId }]) => matrix.leave(roomId)),
    ignoreElements(),
  );

/**
 * If we leave a room for any reason (eg. a kick event), purge it from state
 * Notice excess rooms left by matrixLeaveExcessRoomsEpic are cleaned before the matrix event is
 * detected, and then no MatrixRoomLeaveAction is emitted for them by this epic.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of matrixRoomLeave actions
 */
export const matrixCleanLeftRoomsEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<matrixRoomLeave> =>
  matrix$.pipe(
    // when matrix finishes initialization, register to matrix invite events
    switchMap(matrix =>
      fromEvent<{ room: Room; membership: string; matrix: MatrixClient }>(
        matrix,
        'Room.myMembership',
        (room, membership) => ({ room, membership, matrix }),
      ),
    ),
    // filter for leave events to us
    filter(({ membership }) => membership === 'leave'),
    withLatestFrom(state$),
    mergeMap(function*([{ room }, state]) {
      const rooms = state.transport.matrix?.rooms ?? {};
      for (const address in rooms) {
        for (const roomId of rooms[address]) {
          if (roomId === room.roomId) {
            yield matrixRoomLeave({ roomId }, { address: address as Address });
          }
        }
      }
    }),
  );

function waitMember$(
  address: Address,
  matrix: MatrixClient,
  latest$: RaidenEpicDeps['latest$'],
): Observable<RoomMember> {
  return latest$.pipe(
    map(({ state }) => state.transport.matrix?.rooms?.[address]?.[0]),
    // wait for a room to exist (created or invited) for address
    filter(isntNil),
    distinctUntilChanged(),
    // this switchMap unsubscribes from previous "wait" if first room for address changes
    switchMap(roomId =>
      // get/wait room object for roomId
      // may wait for the room state to be populated (happens after createRoom resolves)
      getRoom$(matrix, roomId).pipe(
        mergeMap(room =>
          // wait for address to be monitored & online (after getting Room for address)
          // latest$ ensures it happens immediatelly if all conditions are satisfied
          latest$.pipe(
            pluck('presences', address),
            map(presence => (presence?.payload?.available ? presence.payload.userId : undefined)),
            distinctUntilChanged(),
            map(userId => ({ room, userId })),
          ),
        ),
        // when user is online, get room member for partner's userId
        // this switchMap unsubscribes from previous wait if userId changes or go offline
        switchMap(({ room, userId }) => {
          if (!userId) return EMPTY; // user not monitored or not available
          const member = room.getMember(userId);
          // if it already joined room, return its membership
          if (member && member.membership === 'join') return of(member);
          // else, wait for the user to join/accept invite
          return fromEvent<RoomMember>(
            matrix,
            'RoomMember.membership',
            ({}: MatrixEvent, member: RoomMember) => member,
          ).pipe(
            filter(
              member =>
                member.roomId === room.roomId &&
                member.userId === userId &&
                member.membership === 'join',
            ),
          );
        }),
      ),
    ),
    take(1), // use first room/user which meets all requirements/filters above
  );
}

/**
 * Handles a [[messageSend.request]] action and send its message to the first room on queue for
 * address
 *
 * @param action$ - Observable of messageSend.request actions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of messageSend.success actions
 */
export const matrixMessageSendEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, matrix$, config$, latest$ }: RaidenEpicDeps,
): Observable<RaidenAction> =>
  action$.pipe(
    filter(isActionOf(messageSend.request)),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
    groupBy(({ action }) => action.meta.address),
    // merge all inner/grouped observables, so different user's "queues" can be parallel
    mergeMap(grouped$ =>
      // per-user "queue"
      grouped$.pipe(
        // each per-user "queue" (observable) are processed serially (because concatMap)
        // TODO: batch all pending messages in a single send message request, with retry
        concatMap(({ action, matrix }) =>
          // wait for address to be monitored, online & have joined a non-global room with us
          waitMember$(action.meta.address, matrix, latest$).pipe(
            // send message!
            mergeMap(({ roomId }) => {
              const RETRY_COUNT = 3; // is this relevant enough to become a constant/setting?
              const body: string =
                typeof action.payload.message === 'string'
                  ? action.payload.message
                  : encodeJsonMessage(action.payload.message);
              return defer(() =>
                matrix.sendEvent(roomId, 'm.room.message', { body, msgtype: 'm.text' }, ''),
              ).pipe(
                retryWhen(err$ =>
                  // if sendEvent throws, omit & retry after httpTimeout / N,
                  // up to RETRY_COUNT times; if it continues to error, throws down
                  err$.pipe(
                    withLatestFrom(config$),
                    mergeMap(([err, { httpTimeout }], i) => {
                      if (i < RETRY_COUNT - 1) {
                        log.warn(`messageSend error, retrying ${i + 1}/${RETRY_COUNT}`, err);
                        return timer(httpTimeout / RETRY_COUNT);
                        // give up
                      } else return throwError(err);
                    }),
                  ),
                ),
              );
            }),
            mapTo(messageSend.success(undefined, action.meta)),
            catchError(err => {
              log.error('messageSend error', err, action.meta);
              return of(messageSend.failure(err, action.meta));
            }),
          ),
        ),
      ),
    ),
  );

/**
 * Handles a [[messageGlobalSend]] action and send one-shot message to a global room
 *
 * @param action$ - Observable of messageGlobalSend actions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Empty observable (whole side-effect on matrix instance)
 */
export const matrixMessageGlobalSendEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, matrix$, config$ }: RaidenEpicDeps,
): Observable<RaidenAction> =>
  // actual output observable, gets/wait for the user to be in a room, and then sendMessage
  action$.pipe(
    filter(isActionOf(messageGlobalSend)),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
    withLatestFrom(config$),
    mergeMap(([{ action, matrix }, config]) => {
      const globalRooms = globalRoomNames(config);
      if (!globalRooms.includes(action.meta.roomName)) {
        log.warn(
          'messageGlobalSend for unknown global room, ignoring',
          action.meta.roomName,
          globalRooms,
        );
        return EMPTY;
      }
      const serverName = getServerName(matrix.baseUrl),
        roomAlias = `#${action.meta.roomName}:${serverName}`;
      return getRoom$(matrix, roomAlias).pipe(
        // send message!
        mergeMap(room => {
          const body: string =
            typeof action.payload.message === 'string'
              ? action.payload.message
              : encodeJsonMessage(action.payload.message);
          return matrix.sendEvent(room.roomId, 'm.room.message', { body, msgtype: 'm.text' }, '');
        }),
        catchError(err => {
          log.error(
            'Error sending message to global room',
            action.meta,
            action.payload.message,
            err,
          );
          return EMPTY;
        }),
      );
    }),
    ignoreElements(),
  );

/**
 * Subscribe to matrix messages and emits MessageReceivedAction upon receiving a valid message from
 * an user of interest (one valid signature from an address we monitor) in a room we have for them
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of messageReceived actions
 */
export const matrixMessageReceivedEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, matrix$, config$, latest$ }: RaidenEpicDeps,
): Observable<messageReceived> =>
  // gets/wait for the user to be in a room, and then sendMessage
  matrix$.pipe(
    // when matrix finishes initialization, register to matrix timeline events
    switchMap(matrix =>
      fromEvent<{ event: MatrixEvent; room: Room; matrix: MatrixClient }>(
        matrix,
        'Room.timeline',
        (event, room) => ({ matrix, event, room }),
      ),
    ),
    withLatestFrom(config$),
    // filter for text messages not from us and not from global rooms
    filter(
      ([{ matrix, event, room }, config]) =>
        event.getType() === 'm.room.message' &&
        event.event.content.msgtype === 'm.text' &&
        event.getSender() !== matrix.getUserId() &&
        !globalRoomNames(config).some(g =>
          // generate an alias for global room of given name, and check if room matches
          roomMatch(`#${g}:${getServerName(matrix.getHomeserverUrl())}`, room),
        ),
    ),
    mergeMap(([{ event, room }, { httpTimeout }]) =>
      latest$.pipe(
        filter(({ presences, state }) => {
          const presence = find(presences, ['payload.userId', event.getSender()]);
          if (!presence) return false;
          const rooms = state.transport.matrix?.rooms?.[presence.meta.address] ?? [];
          if (!rooms.includes(room.roomId)) return false;
          return true;
        }),
        take(1),
        // take up to an arbitrary timeout to presence status for the sender
        // AND the room in which this message was sent to be in sender's address room queue
        takeUntil(timer(httpTimeout)),
        mergeMap(function*({ presences }) {
          const presence = find(presences, ['payload.userId', event.getSender()])!;
          for (const line of (event.event.content.body || '').split('\n')) {
            let message: Signed<Message> | undefined;
            try {
              message = decodeJsonMessage(line);
              const signer = getMessageSigner(message);
              if (signer !== presence.meta.address)
                throw new RaidenError(ErrorCodes.TRNS_MESSAGE_SIGNATURE_MISMATCH, [
                  { sender: presence.meta.address, signer },
                ]);
            } catch (err) {
              log.warn(`Could not decode message: ${line}: ${err}`);
              message = undefined;
            }
            yield messageReceived(
              {
                text: line,
                message,
                ts: event.event.origin_server_ts ?? Date.now(),
                userId: presence.payload.userId,
                roomId: room.roomId,
              },
              presence.meta,
            );
          }
        }),
      ),
    ),
  );

/**
 * If matrix received a message from user in a room we have with them, but not the first on queue,
 * update queue so this room goes to the front and will be used as send message room from now on
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of matrixRoom actions
 */
export const matrixMessageReceivedUpdateRoomEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<matrixRoom> =>
  action$.pipe(
    filter(isActionOf(messageReceived)),
    withLatestFrom(state$),
    filter(([action, state]) => {
      const rooms = state.transport.matrix?.rooms?.[action.meta.address] ?? [];
      return (
        !!action.payload.roomId &&
        rooms.includes(action.payload.roomId) &&
        rooms[0] !== action.payload.roomId
      );
    }),
    map(([action]) => matrixRoom({ roomId: action.payload.roomId! }, action.meta)),
  );

/**
 * Channel monitoring triggers matrix presence monitoring for partner
 *
 * @param action$ - Observable of RaidenActions
 * @returns Observable of matrixPresence.request actions
 */
export const matrixMonitorChannelPresenceEpic = (
  action$: Observable<RaidenAction>,
): Observable<matrixPresence.request> =>
  action$.pipe(
    filter(isActionOf(channelMonitor)),
    map(action => matrixPresence.request(undefined, { address: action.meta.partner })),
  );

/**
 * Sends Delivered for specific messages
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @param signer - RaidenEpicDeps members
 * @returns Observable of messageSend.request actions
 */
export const deliveredEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer }: RaidenEpicDeps,
): Observable<messageSend.request> => {
  const cache = new LruCache<string, Signed<Delivered>>(32);
  return action$.pipe(
    filter(isActionOf(messageReceived)),
    concatMap(action => {
      const message = action.payload.message;
      if (
        !message ||
        !(
          Signed(Processed).is(message) ||
          Signed(SecretRequest).is(message) ||
          Signed(SecretReveal).is(message)
        )
      )
        return EMPTY;
      // defer causes the cache check to be performed at subscription time
      return defer(() => {
        const msgId = message.message_identifier;
        const key = msgId.toString();
        const cached = cache.get(key);
        if (cached)
          return of(
            messageSend.request({ message: cached }, { address: action.meta.address, msgId: key }),
          );

        const delivered: Delivered = {
          type: MessageType.DELIVERED,
          delivered_message_identifier: msgId,
        };
        log.info(`Signing "${delivered.type}" for "${message.type}" with id=${msgId.toString()}`);
        return from(signMessage(signer, delivered, { log })).pipe(
          tap(signed => cache.put(key, signed)),
          map(signed =>
            messageSend.request({ message: signed }, { address: action.meta.address, msgId: key }),
          ),
        );
      });
    }),
  );
};
