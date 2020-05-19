/* eslint-disable @typescript-eslint/camelcase */
import { Observable, of, EMPTY, fromEvent, timer, defer, from } from 'rxjs';
import {
  catchError,
  concatMap,
  filter,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  withLatestFrom,
  switchMap,
  take,
  takeUntil,
  mapTo,
  tap,
} from 'rxjs/operators';
import find from 'lodash/find';

import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

import { Capabilities } from '../../constants';
import { Signed } from '../../utils/types';
import { isActionOf } from '../../utils/actions';
import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import {
  Delivered,
  Processed,
  SecretRequest,
  SecretReveal,
  MessageType,
} from '../../messages/types';
import { encodeJsonMessage, isMessageReceivedOfType, signMessage } from '../../messages/utils';
import { messageSend, messageReceived, messageGlobalSend } from '../../messages/actions';
import { RaidenState } from '../../state';
import { getServerName } from '../../utils/matrix';
import { LruCache } from '../../utils/lru';
import { globalRoomNames, roomMatch, getRoom$, waitMemberAndSend$, parseMessage } from './helpers';

/**
 * Handles a [[messageSend.request]] action and send its message to the first room on queue for
 * address
 *
 * @param action$ - Observable of messageSend.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config object
 * @param deps.latest$ - Latest values
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
    mergeMap((action) => matrix$.pipe(map((matrix) => ({ action, matrix })))),
    groupBy(({ action }) => action.meta.address),
    // merge all inner/grouped observables, so different user's "queues" can be parallel
    mergeMap((grouped$) =>
      // per-user "queue"
      grouped$.pipe(
        // each per-user "queue" (observable) are processed serially (because concatMap)
        // TODO: batch all pending messages in a single send message request, with retry
        concatMap(({ action, matrix }) => {
          const body: string =
            typeof action.payload.message === 'string'
              ? action.payload.message
              : encodeJsonMessage(action.payload.message);
          const content = { body, msgtype: 'm.text' };
          // wait for address to be monitored, online & have joined a non-global room with us
          return waitMemberAndSend$(
            action.meta.address,
            matrix,
            'm.room.message',
            content,
            { log, latest$, config$ },
            true, // alowRtc
          ).pipe(
            mapTo(messageSend.success(undefined, action.meta)),
            catchError((err) => {
              log.error('messageSend error', err, action.meta);
              return of(messageSend.failure(err, action.meta));
            }),
          );
        }),
      ),
    ),
  );

/**
 * Handles a [[messageGlobalSend]] action and send one-shot message to a global room
 *
 * @param action$ - Observable of messageGlobalSend actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config observable
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
    mergeMap((action) => matrix$.pipe(map((matrix) => ({ action, matrix })))),
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
      const serverName = getServerName(matrix.getHomeserverUrl()),
        roomAlias = `#${action.meta.roomName}:${serverName}`;
      return getRoom$(matrix, roomAlias).pipe(
        // send message!
        mergeMap((room) => {
          const body: string =
            typeof action.payload.message === 'string'
              ? action.payload.message
              : encodeJsonMessage(action.payload.message);
          return matrix.sendEvent(room.roomId, 'm.room.message', { body, msgtype: 'm.text' }, '');
        }),
        catchError((err) => {
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
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest values
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
    switchMap((matrix) =>
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
        event.event?.content?.msgtype === 'm.text' &&
        event.getSender() !== matrix.getUserId() &&
        !globalRoomNames(config).some((g) =>
          // generate an alias for global room of given name, and check if room matches
          roomMatch(`#${g}:${getServerName(matrix.getHomeserverUrl())}`, room),
        ),
    ),
    mergeMap(([{ event, room }, { httpTimeout }]) =>
      latest$.pipe(
        filter(({ presences, state }) => {
          const presence = find(presences, ['payload.userId', event.getSender()]);
          if (!presence) return false;
          const rooms = state.transport.rooms?.[presence.meta.address] ?? [];
          if (!rooms.includes(room.roomId)) return false;
          return true;
        }),
        take(1),
        // take up to an arbitrary timeout to presence status for the sender
        // AND the room in which this message was sent to be in sender's address room queue
        takeUntil(timer(httpTimeout)),
        mergeMap(function* ({ presences }) {
          const presence = find(presences, ['payload.userId', event.getSender()])!;
          for (const line of (event.event.content.body || '').split('\n')) {
            const message = parseMessage(line, presence.meta.address, { log });
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
 * Sends Delivered for specific messages
 *
 * @param action$ - Observable of messageReceived actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.latest$ - Latest observable
 * @returns Observable of messageSend.request actions
 */
export const deliveredEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer, latest$ }: RaidenEpicDeps,
): Observable<messageSend.request> => {
  const cache = new LruCache<string, Signed<Delivered>>(32);
  return action$.pipe(
    filter(
      isMessageReceivedOfType([Signed(Processed), Signed(SecretRequest), Signed(SecretReveal)]),
    ),
    withLatestFrom(latest$),
    filter(
      ([action, { presences }]) =>
        action.meta.address in presences &&
        // skip if peer supports Capabilities.NO_DELIVERY
        !presences[action.meta.address].payload.caps?.[Capabilities.NO_DELIVERY],
    ),
    concatMap(([action]) => {
      const message = action.payload.message;
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
          tap((signed) => cache.put(key, signed)),
          map((signed) =>
            messageSend.request({ message: signed }, { address: action.meta.address, msgId: key }),
          ),
        );
      });
    }),
  );
};
