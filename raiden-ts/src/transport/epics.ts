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
  publishReplay,
  pluck,
  repeatWhen,
  exhaustMap,
  throwIfEmpty,
  switchMapTo,
  retryWhen,
} from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { find, get, minBy, sortBy } from 'lodash';

import { getAddress, verifyMessage } from 'ethers/utils';

import { createClient, MatrixClient, MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import matrixLogger from 'matrix-js-sdk/lib/logger';

import { Address, Signed, isntNil, assert } from '../utils/types';
import { isActionOf } from '../utils/actions';
import { RaidenEpicDeps } from '../types';
import { RaidenAction } from '../actions';
import { channelMonitor } from '../channels/actions';
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
import { matrixRoom, matrixRoomLeave, matrixSetup, matrixPresence } from './actions';
import { RaidenMatrixSetup } from './state';
import { getPresences$, getRoom$, roomMatch, globalRoomNames } from './utils';

// unavailable just means the user didn't do anything over a certain amount of time, but they're
// still there, so we consider the user as available/online then
const AVAILABLE = ['online', 'unavailable'];
const userRe = /^@(0x[0-9a-f]{40})[.:]/i;

/**
 * Search user directory for valid users matching a given address and return latest
 *
 * @param matrix - Matrix client to search users from
 * @param address - Address of interest
 * @returns Observable of user with most recent presence
 */
function searchAddressPresence$(matrix: MatrixClient, address: Address) {
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
          console.log('Error fetching user presence, ignoring:', err);
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
      if (!presences.length)
        throw new Error(`Could not find any user with valid signature for ${address}`);
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
    throwIfEmpty(() => new Error('Could not contact any matrix servers')),
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
 * @param deps.config$ - Used to calculate global rooms to join
 * @returns Observable of one { matrix, server, setup } object
 */
function setupMatrixClient$(
  server: string,
  setup: RaidenMatrixSetup | undefined,
  {
    address,
    signer,
    config$,
  }: {
    address: RaidenEpicDeps['address'];
    signer: RaidenEpicDeps['signer'];
    config$: RaidenEpicDeps['config$']; // better than the extra type imports
  },
) {
  const serverName = getServerName(server);
  if (!serverName) throw new Error(`Could not get serverName from "${server}"`);

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
    withLatestFrom(config$),
    // the APIs below are authenticated, and therefore also act as validator
    mergeMap(([{ matrix, server, setup }, config]) =>
      // ensure displayName is set even on restarts
      from(matrix.setDisplayName(setup.displayName)).pipe(
        mergeMap(() => globalRoomNames(config)),
        map(globalRoom => `#${globalRoom}:${serverName}`),
        mergeMap(alias => matrix.joinRoom(alias)),
        toArray(), // wait all joinRoom promises to complete
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
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, signer, matrix$, config$ }: RaidenEpicDeps,
): Observable<matrixSetup> =>
  combineLatest([state$, config$]).pipe(
    first(), // at startup
    mergeMap(([state, { matrixServer, matrixServerLookup, httpTimeout }]) => {
      const server: string | undefined = get(state, ['transport', 'matrix', 'server']),
        setup: RaidenMatrixSetup | undefined = get(state, ['transport', 'matrix', 'setup']);

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
          setupMatrixClient$(server, setup, { address, signer, config$ }).pipe(
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
        // wait for matrixSetup to be persisted in state, then resolves matrix$ with client
        state$.pipe(
          pluck('transport', 'matrix', 'server'),
          filter((_server): _server is string => !!_server),
          take(1),
          tap(() => {
            matrix$.next(matrix);
            matrix$.complete();
          }),
          switchMapTo(matrix$),
          delay(1e3), // wait 1s before starting matrix, so event listeners can be registered
          mergeMap(matrix => matrix.startClient({ initialSyncLimit: 0 })),
          ignoreElements(),
        ),
        // emit matrixSetup in parallel to be persisted in state
        of(matrixSetup({ server, setup })),
        // monitor config.logger & disable or re-enable matrix's logger accordingly
        config$.pipe(
          pluck('logger'),
          distinctUntilChanged(),
          tap(logger =>
            matrixLogger.setLevel(
              logger !== '' && (logger !== undefined || process.env.NODE_ENV === 'development')
                ? 'debug'
                : 'error',
            ),
          ),
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
  { matrix$ }: RaidenEpicDeps,
): Observable<matrixPresence.success | matrixPresence.failure> =>
  getPresences$(action$).pipe(
    publishReplay(1, undefined, presences$ =>
      action$.pipe(
        filter(isActionOf(matrixPresence.request)),
        // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
        mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
        groupBy(({ action }) => action.meta.address),
        mergeMap(grouped$ =>
          grouped$.pipe(
            withLatestFrom(presences$),
            // if we're already fetching presence for this address, no need to fetch again
            exhaustMap(([{ action, matrix }, presences]) =>
              action.meta.address in presences
                ? // we already monitored/saw this user's presence
                  of(presences[action.meta.address])
                : searchAddressPresence$(matrix, action.meta.address).pipe(
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
  { matrix$ }: RaidenEpicDeps,
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
      getPresences$(action$),
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

      // fetch profile info if user doesn't contain a displayName
      const displayName$: Observable<string | undefined> = user.displayName
        ? of(user.displayName)
        : from(matrix.getProfileInfo(userId, 'displayname')).pipe(
            pluck('displayname'),
            catchError(() => of(undefined)),
          );

      return displayName$.pipe(
        map(displayName => {
          // errors raised here will be logged and ignored on catchError below
          if (!displayName) throw new Error(`Could not get displayName of "${userId}"`);
          // ecrecover address, validating displayName is the signature of the userId
          const recovered = verifyMessage(userId, displayName) as Address | undefined;
          if (!recovered || recovered !== address)
            throw new Error(
              `Could not verify displayName signature of "${userId}": got "${recovered}"`,
            );
          return recovered;
        }),
        map(address =>
          matrixPresence.success(
            { userId, available, ts: user.lastPresenceTs ?? Date.now() },
            { address },
          ),
        ),
      );
    }),
    catchError(err => (console.log('Error validating presence event, ignoring', err), EMPTY)),
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
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<matrixRoom> =>
  combineLatest(getPresences$(action$), state$).pipe(
    // multicasting combined presences+state with a ReplaySubject makes it act as withLatestFrom
    // but working inside concatMap, which is called only at outer next and subscribe delayed
    publishReplay(1, undefined, presencesStateReplay$ =>
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
              presencesStateReplay$.pipe(
                // wait for user to be monitored
                filter(([presences]) => address in presences),
                take(1),
                // if there's already a room in state for address, skip
                filter(([, state]) => !get(state.transport, ['matrix', 'rooms', address, 0])),
                // else, create a room, invite known user and persist roomId in state
                mergeMap(([presences]) =>
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
  state$: Observable<RaidenState>,
  { matrix$, config$ }: RaidenEpicDeps,
): Observable<RaidenAction> =>
  state$.pipe(
    publishReplay(1, undefined, state$ =>
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
                : state$.pipe(
                    map(
                      state =>
                        get(state, ['transport', 'matrix', 'rooms', action.meta.address, 0]) as
                          | string
                          | undefined,
                    ),
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
                          inviteLoop$(matrix, roomId, action.payload.userId, config$),
                    ),
                  ),
            ),
          ),
        ),
        ignoreElements(),
      ),
    ),
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
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, config$ }: RaidenEpicDeps,
): Observable<matrixRoom> =>
  getPresences$(action$).pipe(
    publishReplay(1, undefined, presences$ =>
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
            senderPresence$ = presences$.pipe(
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
            map(() =>
              matrixRoom({ roomId: member.roomId }, { address: senderPresence.meta.address }),
            ),
          ),
        ),
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
      const rooms: { [address: string]: string[] } = get(
        state,
        ['transport', 'matrix', 'rooms'],
        {},
      );
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
      const rooms: { [address: string]: string[] } = get(
        state,
        ['transport', 'matrix', 'rooms'],
        {},
      );
      for (const address in rooms) {
        for (const roomId of rooms[address]) {
          if (roomId === room.roomId) {
            yield matrixRoomLeave({ roomId }, { address: address as Address });
          }
        }
      }
    }),
  );

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
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<RaidenAction> =>
  combineLatest(getPresences$(action$), state$).pipe(
    // multicasting combined presences+state with a ReplaySubject makes it act as withLatestFrom
    // but working inside concatMap, called only at outer emit and subscription delayed
    publishReplay(1, undefined, presencesStateReplay$ =>
      // actual output observable, gets/wait for the user to be in a room, and then sendMessage
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
              presencesStateReplay$.pipe(
                // wait for address to be monitored, online and roomId to be in state.
                // ReplaySubject ensures it happens immediatelly if all conditions are satisfied
                filter(
                  ([presences, state]) =>
                    action.meta.address in presences &&
                    presences[action.meta.address].payload.available &&
                    get(state, ['transport', 'matrix', 'rooms', action.meta.address, 0]),
                ),
                map(([, state]) => state.transport!.matrix!.rooms![action.meta.address][0]),
                distinctUntilChanged(),
                // get/wait room object for roomId
                // may wait for the room state to be populated (happens after createRoom resolves)
                switchMap(roomId => getRoom$(matrix, roomId)),
                // get up-to-date/last presences at this point in time, which may have been updated
                withLatestFrom(presencesStateReplay$),
                // get room member for partner userId
                mergeMap(([room, [presences]]) => {
                  // get latest known userId for address at this point in time
                  const userId = presences[action.meta.address].payload.userId;
                  const member = room.getMember(userId);
                  // if it's already present in room, return its membership
                  if (member && member.membership === 'join') return of(member);
                  // else, wait for the user to join our newly created room
                  return fromEvent<RoomMember>(
                    matrix,
                    'RoomMember.membership',
                    ({}: MatrixEvent, member: RoomMember) => member,
                  ).pipe(
                    // use up-to-date presences again, which may have been updated while
                    // waiting for member join event (e.g. user roamed and was re-invited)
                    withLatestFrom(presencesStateReplay$),
                    filter(
                      ([member, [presences]]) =>
                        member.roomId === room.roomId &&
                        member.userId === presences[action.meta.address].payload.userId &&
                        member.membership === 'join',
                    ),
                    take(1),
                    map(([member]) => member),
                  );
                }),
                take(1), // use first room/user which meets all requirements/filters so far
                // send message!
                mergeMap(member => {
                  const body: string =
                    typeof action.payload.message === 'string'
                      ? action.payload.message
                      : encodeJsonMessage(action.payload.message);
                  return matrix.sendEvent(
                    member.roomId,
                    'm.room.message',
                    { body, msgtype: 'm.text' },
                    '',
                  );
                }),
                map(() => messageSend.success(undefined, action.meta)),
              ),
            ),
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
  { matrix$, config$ }: RaidenEpicDeps,
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
        console.warn(
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
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { matrix$, config$ }: RaidenEpicDeps,
): Observable<messageReceived> =>
  combineLatest(getPresences$(action$), state$).pipe(
    // multicasting combined presences+state with a ReplaySubject makes it act as withLatestFrom
    // but working inside concatMap, called only at outer emit and subscription delayed
    publishReplay(1, undefined, presencesStateReplay$ =>
      // actual output observable, gets/wait for the user to be in a room, and then sendMessage
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
          presencesStateReplay$.pipe(
            filter(([presences, state]) => {
              const presence = find(presences, ['payload.userId', event.getSender()]);
              if (!presence) return false;
              const rooms: string[] = get(
                state,
                ['transport', 'matrix', 'rooms', presence.meta.address],
                [],
              );
              if (!rooms.includes(room.roomId)) return false;
              return true;
            }),
            take(1),
            // take up to an arbitrary timeout to presence status for the sender
            // AND the room in which this message was sent to be in sender's address room queue
            takeUntil(timer(httpTimeout)),
            mergeMap(function*([presences]) {
              const presence = find(presences, ['payload.userId', event.getSender()])!;
              for (const line of (event.event.content.body || '').split('\n')) {
                let message: Signed<Message> | undefined;
                try {
                  message = decodeJsonMessage(line);
                  const signer = getMessageSigner(message);
                  if (signer !== presence.meta.address)
                    throw new Error(
                      `Signature mismatch: sender=${presence.meta.address} != signer=${signer}`,
                    );
                } catch (err) {
                  console.warn(`Could not decode message: ${line}: ${err}`);
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
      const rooms: string[] = get(
        state,
        ['transport', 'matrix', 'rooms', action.meta.address],
        [],
      );
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
  { signer }: RaidenEpicDeps,
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
        console.log(
          `Signing "${delivered.type}" for "${message.type}" with id=${msgId.toString()}`,
        );
        return from(signMessage(signer, delivered)).pipe(
          tap(signed => cache.put(key, signed)),
          map(signed =>
            messageSend.request({ message: signed }, { address: action.meta.address, msgId: key }),
          ),
        );
      });
    }),
  );
};
