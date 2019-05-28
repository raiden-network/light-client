import { ofType } from 'redux-observable';
import { Observable, combineLatest, from, of, EMPTY, fromEvent, timer, ReplaySubject } from 'rxjs';
import {
  catchError,
  concatMap,
  distinctUntilChanged,
  filter,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  multicast,
  withLatestFrom,
  scan,
  startWith,
  switchMap,
  take,
  takeUntil,
  tap,
  toArray,
} from 'rxjs/operators';
import { get, find, minBy } from 'lodash';

import { getAddress, verifyMessage } from 'ethers/utils';
import { MatrixClient, MatrixEvent, User, Room, RoomMember } from 'matrix-js-sdk';

import { RaidenEpicDeps } from '../../types';
import { RaidenState } from '../state';
import { getUserPresence } from '../../utils';
import {
  RaidenActionType,
  RaidenActions,
  MatrixSetupAction,
  MatrixRequestMonitorPresenceAction,
  MatrixRequestMonitorPresenceActionFailed,
  MatrixPresenceUpdateAction,
  matrixPresenceUpdate,
  matrixRequestMonitorPresenceFailed,
  matrixRoom,
  MatrixRoomAction,
  MessageSendAction,
} from '../actions';

interface Presences {
  [address: string]: MatrixPresenceUpdateAction;
}

// unavailable just means the user didn't do anything over a certain amount of time, but they're
// still there, so we consider the user as available then
const AVAILABLE = ['online', 'unavailable'];
const userRe = /^@(0x[0-9a-f]{40})[.:]/i;

/**
 * Helper to map/get an aggregated Presences observable from action$ bus
 * Known presences as { address: <last seen MatrixPresenceUpdateAction> } mapping
 * As this helper is basically a scan/reduce, you can't simply startWith the first/initial value,
 * as it needs to also be the initial mapping for the scan itself, so instead of pipe+startWith,
 * as we usually do with state$, we need to get the initial value as parameter when it's used in
 * withLatestFrom in some inner observable
 * @param action$ Observable
 * @param first optional Presences used as starting point, empty mapping used by default
 * @returns Observable of aggregated Presences from subscription to now
 */
const getPresences$ = (
  action$: Observable<RaidenActions>,
  first: Presences = {},
): Observable<Presences> =>
  action$.pipe(
    ofType<RaidenActions, MatrixPresenceUpdateAction>(RaidenActionType.MATRIX_PRESENCE_UPDATE),
    scan(
      // scan all presence update actions and populate/output a per-address mapping
      (presences: Presences, update: MatrixPresenceUpdateAction) => ({
        ...presences,
        [update.address]: update,
      }),
      first,
    ),
    startWith(first),
  );

/**
 * Start MatrixClient sync polling when detecting MatrixSetupAction, **after** init time fromEvents
 * were already registered.
 * This is required to ensure init-time events registering are done before initial sync, to avoid
 * losing one-shot events, like invitations.
 */
export const matrixStartEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
  action$.pipe(
    ofType<RaidenActions, MatrixSetupAction>(RaidenActionType.MATRIX_SETUP),
    switchMap(() => matrix$),
    tap(matrix => console.log('MATRIX client', matrix)),
    mergeMap(matrix => matrix.startClient({ initialSyncLimit: 0 })),
    ignoreElements(),
  );

/**
 * Calls matrix.stopClient when raiden is shutting down, i.e. action$ completes
 */
export const matrixShutdownEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
  matrix$.pipe(
    tap(matrix => action$.subscribe(undefined, undefined, () => matrix.stopClient())),
    ignoreElements(),
  );

/**
 * Handles MatrixRequestMonitorPresenceAction and emits a MatrixPresenceUpdateAction
 * If presence is already known, emits it, else fetch from user profile
 * Even if the presence stays the same, we emit a MatrixPresenceUpdateAction, as this may be a
 * request being waited by a promise or something like that
 * IOW: every request should be followed by a presence update or a failed action, but presence
 * updates may happen later without new requests (e.g. when the user goes offline)
 */
export const matrixMonitorPresenceEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<MatrixPresenceUpdateAction | MatrixRequestMonitorPresenceActionFailed> =>
  action$.pipe(
    ofType<RaidenActions, MatrixRequestMonitorPresenceAction>(
      RaidenActionType.MATRIX_REQUEST_MONITOR_PRESENCE,
    ),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
    withLatestFrom(getPresences$(action$)),
    mergeMap(([{ action, matrix }, presences]) => {
      if (action.address in presences)
        // we already monitored/saw this user's presence
        return of(presences[action.address]);

      const validUsers: User[] = [];
      for (const user of matrix.getUsers()) {
        if (!user.displayName) continue;
        if (!user.presence) continue;
        let recovered: string;
        try {
          const match = userRe.exec(user.userId);
          if (!match || getAddress(match[1]) !== action.address) continue;
          recovered = verifyMessage(user.userId, user.displayName);
          if (!recovered || recovered !== action.address) continue;
        } catch (err) {
          continue;
        }
        validUsers.push(user);
      }
      // IFF we see a cached/stored user (matrix.getUsers), with displayName and presence already
      // populated, which displayName signature verifies to our address of interest,
      // then construct and return the MatrixPresenceUpdateAction from the stored data
      if (validUsers.length > 0) {
        const user = minBy(validUsers, 'lastPresenceTs')!;
        return of(
          matrixPresenceUpdate(action.address, user.userId, AVAILABLE.includes(user.presence!)),
        );
      }

      // if anything failed up to here, go the slow path: searchUserDirectory + getUserPresence
      return from(
        // search user directory for any user containing the address of interest in its userId
        matrix.searchUserDirectory({ term: action.address.toLowerCase() }),
      ).pipe(
        // for every result matches, verify displayName signature is address of interest
        map(({ results }) => {
          const validUsers: string[] = [];
          for (const user of results) {
            if (!user.display_name) continue;
            try {
              const match = userRe.exec(user.user_id);
              if (!match || getAddress(match[1]) !== action.address) continue;
              const recovered = verifyMessage(user.user_id, user.display_name);
              if (!recovered || recovered !== action.address) continue;
            } catch (err) {
              continue;
            }
            validUsers.push(user.user_id);
          }
          if (validUsers.length === 0)
            // if no valid user could be found, throw an error to be handled below
            throw new Error(
              `Could not find any user with valid signature for ${
                action.address
              } in ${JSON.stringify(results)}`,
            );
          else return validUsers;
        }),
        mergeMap(userIds => from(userIds)),
        mergeMap(userId =>
          getUserPresence(matrix, userId).then(presence =>
            // eslint-disable-next-line @typescript-eslint/camelcase
            Object.assign(presence, { user_id: userId }),
          ),
        ),
        toArray(),
        // for all matched/verified users, get its presence through dedicated API
        // it's required because, as the user events could already have been handled and
        // filtered out by matrixPresenceUpdateEpic because it wasn't yet a user-of-interest,
        // we could have missed presence updates, then we need to fetch it here directly,
        // and from now on, that other epic will monitor its updates, and sort by most recently
        // seen user
        map(presences => minBy(presences, 'last_active_ago')!),
        map(({ presence, user_id: userId }) =>
          matrixPresenceUpdate(action.address, userId, AVAILABLE.includes(presence)),
        ),
        catchError(err => of(matrixRequestMonitorPresenceFailed(action.address, err))),
      );
    }),
  );

/**
 * Monitor peers matrix presence from User.presence events
 * We aggregate all users of interest (i.e. for which a monitor request was emitted at some point)
 * and emit presence updates for any presence change happening to a user validating to this address
 */
export const matrixPresenceUpdateEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<MatrixPresenceUpdateAction> =>
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
      const user = matrix.getUser(event.getSender())!,
        match = userRe.exec(user.userId),
        peerAddress = match && match[1];
      // getAddress will convert any valid address into checksummed-format
      return { user, matrix, peerAddress: peerAddress && getAddress(peerAddress) };
    }),
    // filter out events without userId in the right format (startWith hex-address)
    filter(({ user, peerAddress }) => !!(user.presence && peerAddress)),
    withLatestFrom(
      // observable of all addresses whose presence monitoring was requested since init
      action$.pipe(
        ofType<RaidenActions, MatrixRequestMonitorPresenceAction>(
          RaidenActionType.MATRIX_REQUEST_MONITOR_PRESENCE,
        ),
        scan(
          (toMonitor: Set<string>, request: MatrixRequestMonitorPresenceAction) =>
            toMonitor.add(request.address),
          new Set<string>(),
        ),
        startWith(new Set<string>()),
      ),
      // known presences as { address: <last seen MatrixPresenceUpdateAction> } mapping
      getPresences$(action$),
    ),
    // filter out events from users we don't care about
    // i.e.: presence monitoring never requested
    filter(([{ peerAddress }, toMonitor]) => toMonitor.has(peerAddress!)),
    mergeMap(([{ user, matrix, peerAddress }, , presences]) => {
      // first filter can't tell typescript this property will always be set!
      const userId = user.userId,
        address = peerAddress!,
        presence = user.presence!,
        available = AVAILABLE.includes(presence);

      if (
        address in presences &&
        presences[address].userId === userId &&
        presences[address].available === available
      )
        // even if signature verification passes, this wouldn't change presence, so return early
        return EMPTY;

      // fetch profile info if user doesn't contain a displayName
      const displayName$: Observable<string | undefined> = user.displayName
        ? of(user.displayName)
        : from(matrix.getProfileInfo(userId, 'displayname')).pipe(
            map(profile => profile.displayname),
            catchError(() => of(undefined)),
          );

      return displayName$.pipe(
        map(displayName => {
          // errors raised here will be logged and ignored on catchError below
          if (!displayName) throw new Error(`Could not get displayName of "${userId}"`);
          // ecrecover address, validating displayName is the signature of the userId
          const recovered = verifyMessage(userId, displayName);
          if (!recovered || recovered !== peerAddress)
            throw new Error(
              `Could not verify displayName signature of "${userId}": got "${recovered}"`,
            );
          return recovered;
        }),
        map(address => matrixPresenceUpdate(address, userId, available, user.lastPresenceTs)),
      );
    }),
    catchError(err => (console.log('Error validating presence event, ignoring', err), EMPTY)),
  );

/**
 * Upon receiving a MessageSendAction, ensure there's a room for the given address
 * Requires address to have its presence monitored.
 */
export const matrixCreateRoomEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<MatrixRoomAction> =>
  combineLatest(getPresences$(action$), state$).pipe(
    // multicasting combined presences+state with a ReplaySubject makes it act as withLatestFrom
    // but working inside concatMap, which is called only at outer next and subscribe delayed
    multicast(new ReplaySubject<[Presences, RaidenState]>(1), presencesStateReplay$ =>
      // actual output observable, handles MessageSendAction serially and create room if needed
      action$.pipe(
        ofType<RaidenActions, MessageSendAction>(RaidenActionType.MESSAGE_SEND),
        // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
        mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
        // concatMap is used to prevent bursts of messages for a given address (eg. on startup)
        // of creating multiple rooms for same address
        concatMap(({ action, matrix }) =>
          // presencesStateReplay$+take(1) acts like withLatestFrom with cached result
          presencesStateReplay$.pipe(
            // wait for user to be monitored
            filter(([presences]) => action.address in presences),
            take(1),
            // if there's already a room state for address and it's present in matrix, skip
            filter(
              ([, state]) =>
                !get(state, ['transport', 'matrix', 'address2rooms', action.address, 0]),
            ),
            // else, create a room, invite known user and dispatch the respective MatrixRoomAction
            // to store it in state
            mergeMap(([presences]) =>
              matrix.createRoom({
                visibility: 'private',
                invite: [presences[action.address].userId],
              }),
            ),
            map(({ room_id: roomId }) => matrixRoom(action.address, roomId)),
          ),
        ),
      ),
    ),
  );

/**
 * Invites users coming online to rooms we may have with them
 */
export const matrixInviteEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
  action$.pipe(
    ofType<RaidenActions, MatrixPresenceUpdateAction>(RaidenActionType.MATRIX_PRESENCE_UPDATE),
    filter(action => action.available),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
    withLatestFrom(state$),
    mergeMap(([{ action, matrix }, state]) => {
      let roomId: string | undefined = get(state, [
        'transport',
        'matrix',
        'address2rooms',
        action.address,
        0,
      ]);
      if (!roomId) return EMPTY;
      const room = matrix.getRoom(roomId);
      if (!room) return EMPTY;
      const member = room.getMember(action.userId);
      if (member) return EMPTY;
      return from(matrix.invite(roomId, action.userId));
    }),
    ignoreElements(),
  );

/**
 * Handle invites sent to us and accepts them iff sent by a monitored user
 */
export const matrixHandleInvitesEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<MatrixRoomAction> =>
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
    withLatestFrom(getPresences$(action$)),
    mergeMap(([{ event, member, matrix }, presences]) => {
      const sender = event.getSender(),
        cachedPresence = find(presences, p => p.userId === sender),
        senderPresence$ = cachedPresence
          ? of(cachedPresence)
          : action$.pipe(
              // as these membership events can come up quite early, we delay continue processing
              // them a while, to see if the sender is of interest to us (presence monitored)
              ofType<RaidenActions, MatrixPresenceUpdateAction>(
                RaidenActionType.MATRIX_PRESENCE_UPDATE,
              ),
              filter(a => a.userId === sender),
              take(1),
              // Don't wait more than some arbitrary time for this sender presence update to show
              // up; completes without emitting anything otherwise, ending this pipeline.
              // This also works as a filter to continue processing invites only for monitored
              // users, as it'll complete without emitting if no MatrixPresenceUpdateAction is
              // found for sender in time
              takeUntil(timer(30e3)),
            );
      return senderPresence$.pipe(map(senderPresence => ({ matrix, member, senderPresence })));
    }),
    mergeMap(({ matrix, member, senderPresence }) =>
      // join room and emit MatrixRoomAction to make it default/first option for sender address
      from(matrix.joinRoom(member.roomId, { syncRoom: true })).pipe(
        map(() => matrixRoom(senderPresence.address, member.roomId)),
      ),
    ),
  );

export const matrixMessageSendEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<RaidenActions> =>
  combineLatest(getPresences$(action$), state$).pipe(
    // multicasting combined presences+state with a ReplaySubject makes it act as withLatestFrom
    // but working inside concatMap, called only at outer emit and subscription delayed
    multicast(new ReplaySubject<[Presences, RaidenState]>(1), presencesStateReplay$ =>
      // actual output observable, gets/wait for the user to be in a room, and then sendMessage
      action$.pipe(
        ofType<RaidenActions, MessageSendAction>(RaidenActionType.MESSAGE_SEND),
        // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
        mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
        groupBy(({ action }) => action.address),
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
                    action.address in presences &&
                    presences[action.address].available &&
                    get(state, ['transport', 'matrix', 'address2rooms', action.address, 0]),
                ),
                map(([, state]) => state.transport!.matrix!.address2rooms![action.address][0]),
                distinctUntilChanged(),
                // get/wait room object for roomId
                switchMap(roomId => {
                  const room = matrix.getRoom(roomId);
                  // wait for the room state to be populated (happens after createRoom resolves)
                  return room
                    ? of(room)
                    : fromEvent<Room>(matrix, 'Room').pipe(
                        filter(room => room.roomId === roomId),
                        take(1),
                      );
                }),
                // get up-to-date/last presences at this point in time, which may have been updated
                withLatestFrom(presencesStateReplay$),
                // get room member for partner userId
                mergeMap(([room, [presences]]) => {
                  // get latest known userId for address at this point in time
                  const userId = presences[action.address].userId;
                  const member = room.getMember(userId);
                  // if it's already present in room, return its membership
                  if (member && member.membership === 'join') return of(member);
                  // else, wait for the user to join our newly created room
                  return fromEvent<RoomMember>(
                    matrix,
                    'RoomMember.membership',
                    (event: MatrixEvent, member: RoomMember) => member,
                  ).pipe(
                    // use up-to-date presences again, which may have been updated while
                    // waiting for member join event (e.g. user roamed and was re-invited)
                    withLatestFrom(presencesStateReplay$),
                    filter(
                      ([member, [presences]]) =>
                        member.roomId === room.roomId &&
                        member.userId === presences[action.address].userId &&
                        member.membership === 'join',
                    ),
                    take(1),
                    map(([member]) => member),
                  );
                }),
                take(1), // use first room/user which meets all requirements/filters so far
                // send message!
                mergeMap(member =>
                  matrix.sendEvent(
                    member.roomId,
                    'm.room.message',
                    { body: action.message, msgtype: 'm.text' },
                    '',
                  ),
                ),
              ),
            ),
          ),
        ),
        ignoreElements(),
      ),
    ),
  );
