import { Observable, from, of, EMPTY, fromEvent, timer, defer, combineLatest } from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  filter,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  withLatestFrom,
  switchMap,
  take,
  mapTo,
  first,
  timeout,
  exhaustMap,
  distinct,
  delayWhen,
  tap,
} from 'rxjs/operators';
import { MatrixClient, MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';

import { Capabilities } from '../../constants';
import { intervalFromConfig, RaidenConfig } from '../../config';
import { Address, isntNil } from '../../utils/types';
import { isActionOf } from '../../utils/actions';
import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../../state';
import { channelMonitored } from '../../channels/actions';
import { messageReceived } from '../../messages/actions';
import { transferSigned } from '../../transfers/actions';
import { pluckDistinct, retryWhile } from '../../utils/rx';
import { getServerName } from '../../utils/matrix';
import { Direction } from '../../transfers/state';
import { matrixRoom, matrixRoomLeave, matrixPresence } from '../actions';
import { getCap, getSortedAddresses } from '../utils';
import { matchError } from '../../utils/error';
import { globalRoomNames, getRoom$, roomMatch } from './helpers';

/**
 * Returns an observable which keeps inviting userId to roomId while user doesn't join
 *
 * If user already joined, completes immediatelly.
 *
 * @param matrix - client instance
 * @param roomId - room to invite user to
 * @param userId - user to be invited
 * @param config - Config object
 * @param config.pollingInterval - wait this interval before first invite
 * @param config.httpTimeout - wait this interval between retries
 * @param opts - Options object
 * @param opts.log - Logger instance
 * @returns Cold observable which keep inviting user if needed and then completes.
 */
function inviteLoop$(
  matrix: MatrixClient,
  roomId: string,
  userId: string,
  { pollingInterval, httpTimeout }: RaidenConfig,
  { log }: Pick<RaidenEpicDeps, 'log'>,
) {
  return timer(pollingInterval, httpTimeout).pipe(
    exhaustMap(() =>
      defer(async () => {
        const membership = matrix.getRoom(roomId)?.getMember(userId)?.membership;
        if (membership === 'join' || membership === 'invite') return null;
        return matrix.invite(roomId, userId);
      }).pipe(
        tap((e) => {
          if (!e) return;
          log.info('Invited to room', { roomId, userId });
        }),
        catchError((err) => {
          if (!matchError('is already in the room', err))
            // log and suppress to retry on next timer emit
            log.warn('Error inviting', roomId, userId, err);
          return EMPTY;
        }),
        ignoreElements(),
      ),
    ),
  );
}

/**
 * Create room (if needed) for a transfer's target, channel's partner or, as a fallback, for any
 * recipient of a messageSend.request action
 *
 * @param action$ - Observable of transferSigned|channelMonitored|messageSend.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.address - Our address
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.latest$ - Latest values
 * @param deps.config$ - Config observable
 * @returns Observable of matrixRoom actions
 */
export function matrixCreateRoomEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { address, log, matrix$, latest$, config$ }: RaidenEpicDeps,
): Observable<matrixRoom> {
  // actual output observable, selects addresses of interest from actions
  return action$.pipe(
    // ensure there's a room for address of interest for each of these actions
    // matrixRoomLeave ensures a new room is created if all we had are forgotten/left
    filter(isActionOf([transferSigned, channelMonitored, matrixRoomLeave])),
    map((action) => {
      let peer;
      switch (action.type) {
        case transferSigned.type:
          if (
            action.meta.direction === Direction.SENT &&
            action.payload.message.initiator === address
          )
            peer = action.payload.message.target;
          else if (
            action.meta.direction === Direction.RECEIVED &&
            action.payload.message.target === address
          )
            peer = action.payload.message.initiator;
          break;
        case channelMonitored.type:
          peer = action.meta.partner;
          break;
        default:
          peer = action.meta.address;
          break;
      }
      // proceed to create room only if we're the room creator (lower address)
      if (peer && getSortedAddresses(address, peer)[0] === address) return peer;
    }),
    filter(isntNil),
    // groupby+mergeMap ensures different addresses are processed in parallel, and also
    // prevents one stuck address observable (e.g. presence delayed) from holding whole queue
    groupBy((peer) => peer),
    mergeMap((grouped$) =>
      grouped$.pipe(
        // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
        mergeMap((peer) => matrix$.pipe(map((matrix) => ({ peer, matrix })))),
        // exhaustMap is used to prevent bursts of actions for a given address (eg. on startup)
        // of creating multiple rooms for same address, so we ignore new address items while
        // previous is being processed. If user roams, matrixInviteEpic will re-invite
        exhaustMap(({ peer, matrix }) =>
          // presencesStateReplay$+take(1) acts like withLatestFrom with cached result
          latest$.pipe(
            // wait for user to be monitored
            filter(({ presences }) => peer in presences),
            take(1),
            // skip room creation/invite if both partner and us have ToDevice capability set
            filter(
              ({ presences, config }) =>
                !getCap(config.caps, Capabilities.TO_DEVICE) ||
                !getCap(presences[peer].payload.caps, Capabilities.TO_DEVICE),
            ),
            // if there's already a room in state for address, skip
            filter(({ state }) => !state.transport.rooms?.[peer]?.[0]),
            // else, create a room, invite known user and persist roomId in state
            mergeMap(({ presences }) =>
              matrix.createRoom({
                visibility: 'private',
                invite: [presences[peer].payload.userId],
              }),
            ),
            map(({ room_id: roomId }) => matrixRoom({ roomId }, { address: peer })),
            retryWhile(
              intervalFromConfig(config$),
              { maxRetries: 10, onErrors: [429] }, // retry rate-limit errors only
            ),
            catchError((err) => (log.error('Error creating room, ignoring', err), EMPTY)),
          ),
        ),
      ),
    ),
  );
}

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
 * @param deps.latest$ - Latest values
 * @param deps.log - Logger instance
 * @returns Empty observable (whole side-effect on matrix instance)
 */
export function matrixInviteEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, config$, latest$, log }: RaidenEpicDeps,
): Observable<never> {
  return action$.pipe(
    filter(isActionOf(matrixPresence.success)),
    groupBy((a) => a.meta.address),
    mergeMap((grouped$) =>
      // grouped$ is one observable of presence actions per partners address
      combineLatest([
        grouped$,
        latest$.pipe(
          map(({ state }) => state.transport.rooms?.[grouped$.key]?.[0]),
          distinctUntilChanged(),
        ),
      ]).pipe(
        // action comes only after matrix$ is started, so it's safe to use withLatestFrom
        withLatestFrom(matrix$, config$),
        // switchMap on new presence action for address
        switchMap(([[action, roomId], matrix, config]) => {
          // if not available, do nothing (and unsubscribe from previous observable)
          if (!action.payload.available || !roomId) return EMPTY;
          return inviteLoop$(matrix, roomId, action.payload.userId, config, { log });
        }),
      ),
    ),
  );
}

/**
 * Handle invites sent to us and accepts them iff sent by a monitored user
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config ReplaySubject
 * @param deps.latest$ - Latest values
 * @returns Observable of matrixRoom actions
 */
export function matrixHandleInvitesEpic(
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, matrix$, config$, latest$ }: RaidenEpicDeps,
): Observable<matrixRoom> {
  return matrix$.pipe(
    // when matrix finishes initialization, register to matrix invite events
    switchMap((matrix) =>
      fromEvent<[MatrixEvent, RoomMember]>(matrix, 'RoomMember.membership').pipe(
        map(([event, member]) => ({ event, member, matrix })),
      ),
    ),
    filter(
      // filter for invite events to us
      ({ member, matrix }) =>
        member.userId === matrix.getUserId() && member.membership === 'invite',
    ),
    withLatestFrom(config$),
    mergeMap(([{ event, member, matrix }, { httpTimeout }]) =>
      latest$.pipe(
        pluckDistinct('presences'),
        map((presences) =>
          Object.values(presences).find((p) => p.payload.userId === event.getSender()),
        ),
        filter(isntNil),
        take(1),
        // Don't wait more than some arbitrary time for this sender presence update to show
        // up; completes without emitting anything otherwise, ending this pipeline.
        // This also works as a filter to continue processing invites only for monitored
        // users, as it'll complete without emitting if no MatrixPresenceUpdateAction is
        // found for sender in time
        timeout(httpTimeout),
        map((senderPresence) => ({ matrix, member, senderPresence })),
        // on timeout error, leave invited room
        catchError(() =>
          defer(async () => {
            log.info("Leaving invited room because we don't know the inviter", event);
            return matrix.leave(member.roomId);
          }).pipe(
            retryWhile(intervalFromConfig(config$), { onErrors: [429] }),
            catchError((err) => (log.warn('Error leaving invited room, ignoring', err), EMPTY)),
            ignoreElements(),
          ),
        ),
      ),
    ),
    mergeMap(({ matrix, member, senderPresence }) =>
      // join room and emit MatrixRoomAction to make it default/first option for sender address
      defer(async () => matrix.joinRoom(member.roomId, { syncRoom: true })).pipe(
        mapTo(matrixRoom({ roomId: member.roomId }, { address: senderPresence.meta.address })),
        retryWhile(intervalFromConfig(config$), { onErrors: [429] }),
        catchError((err) => (log.warn('Error joining invited room, ignoring', err), EMPTY)),
      ),
    ),
  );
}

/**
 * Leave any excess room for a partner when creating or joining a new one.
 * Excess rooms are LRU beyond a given threshold (configurable, default=3) in address's rooms
 * queue and are checked (only) when a new one is added to it.
 *
 * @param action$ - Observable of matrixRoom actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config object
 * @returns Observable of matrixRoomLeave actions
 */
export function matrixLeaveExcessRoomsEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, matrix$, config$ }: RaidenEpicDeps,
): Observable<matrixRoomLeave> {
  return action$.pipe(
    // act whenever a new room is added to the address queue in state
    filter(isActionOf(matrixRoom)),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap((action) => matrix$.pipe(map((matrix) => ({ action, matrix })))),
    withLatestFrom(state$, config$),
    mergeMap(([{ action, matrix }, state, { matrixExcessRooms }]) => {
      const rooms = state.transport.rooms?.[action.meta.address] ?? [];
      return from(rooms.filter(({}, i) => i >= matrixExcessRooms)).pipe(
        mergeMap((roomId) =>
          matrix
            .leave(roomId)
            .catch((err) => log.error('Error leaving excess room, ignoring', err))
            .then(() => roomId),
        ),
        map((roomId) => matrixRoomLeave({ roomId }, action.meta)),
      );
    }),
  );
}

/**
 * Leave any room which is neither global nor known as a room for some user of interest
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config object
 * @returns Empty observable (whole side-effect on matrix instance)
 */
export function matrixLeaveUnknownRoomsEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, matrix$, config$ }: RaidenEpicDeps,
): Observable<RaidenAction> {
  return matrix$.pipe(
    // when matrix finishes initialization, register to matrix Room events
    switchMap((matrix) => fromEvent<Room>(matrix, 'Room').pipe(map((room) => ({ matrix, room })))),
    // this room may become known later for some reason, so wait a little
    delayWhen(() =>
      config$.pipe(
        first(),
        mergeMap(({ httpTimeout }) => timer(httpTimeout)),
      ),
    ),
    withLatestFrom(state$, config$),
    // filter for leave events to us
    filter(([{ matrix, room }, { transport }, config]) => {
      if (!room) return false; // room already gone while waiting
      const serverName = getServerName(matrix.getHomeserverUrl());
      if (globalRoomNames(config).some((g) => roomMatch(`#${g}:${serverName}`, room)))
        return false;
      for (const rooms of Object.values(transport.rooms ?? {})) {
        for (const roomId of rooms) {
          if (roomId === room.roomId) return false;
        }
      }
      return true;
    }),
    mergeMap(async ([{ matrix, room }]) => {
      log.warn('Unknown room in matrix, leaving', room.roomId);
      return matrix
        .leave(room.roomId)
        .catch((err) => log.error('Error leaving unknown room, ignoring', err));
    }),
    ignoreElements(),
  );
}

/**
 * If we leave a room for any reason (eg. a kick event), purge it from state
 * Notice excess rooms left by matrixLeaveExcessRoomsEpic are cleaned before the matrix event is
 * detected, and then no MatrixRoomLeaveAction is emitted for them by this epic.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.log - Logger instance
 * @returns Observable of matrixRoomLeave actions
 */
export function matrixCleanLeftRoomsEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, matrix$ }: RaidenEpicDeps,
): Observable<matrixRoomLeave> {
  return matrix$.pipe(
    // when matrix finishes initialization, register to matrix invite events
    switchMap((matrix) =>
      fromEvent<[Room, string]>(matrix, 'Room.myMembership').pipe(
        map(([room, membership]) => ({ room, membership, matrix })),
      ),
    ),
    // filter for leave events to us
    filter(({ membership }) => membership === 'leave'),
    withLatestFrom(state$),
    mergeMap(function* ([{ room }, { transport }]) {
      for (const [address, rooms] of Object.entries(transport.rooms ?? {})) {
        for (const roomId of rooms) {
          if (roomId === room.roomId) {
            log.warn('Left event for peer room detected, forgetting', address, roomId);
            yield matrixRoomLeave({ roomId }, { address: address as Address });
          }
        }
      }
    }),
  );
}

/**
 * If some room we had with a peer doesn't show up in transport, forget it
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config object
 * @returns Observable of matrixRoomLeave actions
 */
export function matrixCleanMissingRoomsEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, matrix$, config$ }: RaidenEpicDeps,
): Observable<matrixRoomLeave> {
  return state$.pipe(
    pluckDistinct('transport', 'rooms'),
    filter(isntNil),
    mergeMap(function* (rooms) {
      for (const [address, peerRooms] of Object.entries(rooms)) {
        for (const roomId of peerRooms) {
          yield { roomId, address: address as Address };
        }
      }
    }),
    distinct(({ roomId }) => roomId),
    mergeMap(({ roomId, address }) =>
      matrix$.pipe(map((matrix) => ({ matrix, roomId, address }))),
    ),
    withLatestFrom(config$),
    mergeMap(([{ roomId, address, matrix }, { httpTimeout }]) =>
      getRoom$(matrix, roomId).pipe(
        // wait for room to show up in MatrixClient; if it doesn't, clean up
        timeout(httpTimeout),
        ignoreElements(),
        catchError(() => {
          log.warn('Peer room in state not found in matrix, forgetting', address, roomId);
          return of(matrixRoomLeave({ roomId }, { address }));
        }),
      ),
    ),
  );
}

/**
 * If matrix received a message from user in a room we have with them, but not the first on queue,
 * update queue so this room goes to the front and will be used as send message room from now on
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of matrixRoom actions
 */
export function matrixMessageReceivedUpdateRoomEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
): Observable<matrixRoom> {
  return action$.pipe(
    filter(messageReceived.is),
    withLatestFrom(state$),
    filter(([action, state]) => {
      const rooms = state.transport.rooms?.[action.meta.address] ?? [];
      return (
        !!action.payload.roomId &&
        rooms.includes(action.payload.roomId) &&
        rooms[0] !== action.payload.roomId
      );
    }),
    map(([action]) => matrixRoom({ roomId: action.payload.roomId! }, action.meta)),
  );
}
