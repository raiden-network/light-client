import {
  Observable,
  of,
  EMPTY,
  fromEvent,
  timer,
  defer,
  from,
  merge,
  asapScheduler,
  scheduled,
  combineLatest,
} from 'rxjs';
import {
  catchError,
  concatMap,
  filter,
  ignoreElements,
  map,
  mergeMap,
  withLatestFrom,
  switchMap,
  take,
  takeUntil,
  tap,
  groupBy,
  distinctUntilChanged,
  mapTo,
  delayWhen,
} from 'rxjs/operators';
import constant from 'lodash/constant';

import { EventType, MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

import { concatBuffer, pluckDistinct, retryWhile } from '../../utils/rx';
import { intervalFromConfig, RaidenConfig } from '../../config';
import { Capabilities } from '../../constants';
import { Address, Signed } from '../../utils/types';
import { isActionOf } from '../../utils/actions';
import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import {
  Delivered,
  Processed,
  SecretRequest,
  SecretReveal,
  MessageType,
  Message,
} from '../../messages/types';
import { encodeJsonMessage, isMessageReceivedOfType, signMessage } from '../../messages/utils';
import { messageSend, messageReceived, messageGlobalSend } from '../../messages/actions';
import { RaidenState } from '../../state';
import { getServerName } from '../../utils/matrix';
import { LruCache } from '../../utils/lru';
import { getPresenceByUserId, getCap } from '../utils';
import { globalRoomNames, roomMatch, getRoom$, parseMessage } from './helpers';

function getMessageBody(message: string | Signed<Message>): string {
  return typeof message === 'string' ? message : encodeJsonMessage(message);
}

/**
 * Sends a message on the best possible channel and completes after peer is online
 *
 * @param address - Eth Address of peer/receiver
 * @param content - Event content
 * @param deps - Some members of RaidenEpicDeps needed
 * @param deps.log - Logger instance
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @param deps.matrix$ - Matrix async subject
 * @returns Observable of a string containing the roomAlias or channel label
 */
function sendAndWait$<C extends { msgtype: string; body: string }>(
  address: Address,
  content: C,
  {
    log,
    latest$,
    config$,
    matrix$,
  }: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$' | 'matrix$'>,
): Observable<NonNullable<messageSend.success['payload']>> {
  const type: EventType = 'm.room.message';
  const rtcChannel$ =
    content.msgtype === 'm.text' ? latest$.pipe(pluckDistinct('rtc', address)) : of(null);
  const presence$ = latest$.pipe(pluckDistinct('presences', address));
  const roomId$ = latest$.pipe(
    map(({ state }) => state.transport.rooms?.[address]?.[0]),
    distinctUntilChanged(),
  );
  const via$ = combineLatest([rtcChannel$, presence$, roomId$]).pipe(
    withLatestFrom(config$),
    map(([[rtcChannel, presence, roomId], { caps }]) => {
      if (rtcChannel?.readyState === 'open') return rtcChannel;
      else if (
        getCap(caps, Capabilities.TO_DEVICE) &&
        getCap(presence?.payload.caps, Capabilities.TO_DEVICE)
      )
        return presence!.payload.userId;
      else if (roomId) return roomId;
    }),
    distinctUntilChanged(),
  );
  let start = 0;
  let retries = -1;
  return defer(() => {
    if (!start) start = Date.now();
    return via$;
  }).pipe(
    switchMap((via) => {
      if (!via) return EMPTY;
      retries++;
      if (typeof via !== 'string')
        return defer(async () => {
          via.send(content.body);
          return via.label; // via RTC channel, complete immediately
        });
      else if (via.startsWith('@'))
        return matrix$.pipe(
          mergeMap(async (matrix) => matrix.sendToDevice(type, { [via]: { '*': content } })),
          mapTo(via), // via toDevice message
          // complete only when peer is online
          delayWhen(
            constant(
              presence$.pipe(
                filter(
                  (presence) => presence?.payload.userId === via && presence.payload.available,
                ),
              ),
            ),
          ),
        );
      else
        return matrix$.pipe(
          mergeMap(async (matrix) => matrix.sendEvent(via, type, content, '')),
          mapTo(via), // via room
          // complete only when peer is online
          delayWhen(constant(presence$.pipe(filter((presence) => !!presence?.payload.available)))),
        );
    }),
    retryWhile(intervalFromConfig(config$), {
      maxRetries: 3,
      onErrors: [429, 500],
      log: log.warn,
    }),
    take(1),
    map((via) => ({ via, tookMs: Date.now() - start, retries })),
  );
}

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
export function matrixMessageSendEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<RaidenAction> {
  return action$.pipe(
    filter(isActionOf(messageSend.request)),
    groupBy((action) => `${action.meta.address}|${action.payload.msgtype ?? 'm.text'}`),
    // merge all inner/grouped observables, so different user's "queues" can be parallel
    mergeMap((grouped$) =>
      grouped$.pipe(
        concatBuffer((actions) => {
          const peer = actions[0].meta.address;
          const msgtype = actions[0].payload.msgtype ?? 'm.text';
          const body = actions.map((action) => getMessageBody(action.payload.message)).join('\n');
          const content = { body, msgtype };
          // wait for address to be monitored, online & have joined a non-global room with us
          return sendAndWait$(peer, content, deps).pipe(
            mergeMap((success) =>
              actions.map((action) => messageSend.success(success, action.meta)),
            ),
            catchError((err) => {
              deps.log.error('messageSend error', err, actions[0].meta);
              return from(actions.map((action) => messageSend.failure(err, action.meta)));
            }),
          );
        }, 10),
      ),
    ),
  );
}

function sendGlobalMessages(
  actions: messageGlobalSend[],
  matrix: MatrixClient,
  config: RaidenConfig,
  { config$, log }: Pick<RaidenEpicDeps, 'config$' | 'log'>,
) {
  const roomName = actions[0].meta.roomName;
  const globalRooms = globalRoomNames(config);
  if (!globalRooms.includes(roomName)) {
    log.warn('messageGlobalSend for unknown global room, ignoring', roomName, globalRooms);
    return EMPTY;
  }
  const serverName = getServerName(matrix.getHomeserverUrl());
  const roomAlias = `#${roomName}:${serverName}`;
  // batch action messages in a single text body
  const body = actions.map((action) => getMessageBody(action.payload.message)).join('\n');
  const start = Date.now();
  let retries = -1;
  return getRoom$(matrix, roomAlias).pipe(
    // send message!
    mergeMap(async (room) => {
      retries++;
      return matrix.sendEvent(room.roomId, 'm.room.message', { body, msgtype: 'm.text' }, '');
    }),
    retryWhile(intervalFromConfig(config$), { maxRetries: 3, onErrors: [429, 500] }),
    tap(() =>
      log.info('messageGlobalSend success', {
        tookMs: Date.now() - start,
        retries,
        roomName,
        batchSize: actions.length,
      }),
    ),
    catchError((err) => {
      log.error('Error sending messages to global room', err, {
        retries,
        roomName,
        batchSize: actions.length,
      });
      return EMPTY;
    }),
  );
}

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
export function matrixMessageGlobalSendEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<RaidenAction> {
  const { matrix$, config$ } = deps;
  return action$.pipe(
    filter(isActionOf(messageGlobalSend)),
    groupBy((action) => action.meta.roomName),
    mergeMap((grouped$) =>
      grouped$.pipe(
        concatBuffer((actions) => {
          return matrix$.pipe(
            withLatestFrom(config$),
            mergeMap(([matrix, config]) => sendGlobalMessages(actions, matrix, config, deps)),
          );
        }, 20),
      ),
    ),
    ignoreElements(),
  );
}

// filter for text messages not from us and not from global rooms
function isValidMessage([{ matrix, event, room }, config]: [
  { matrix: MatrixClient; event: MatrixEvent; room: Room | undefined },
  RaidenConfig,
]): boolean {
  const isTextMessage =
    event.getType() === 'm.room.message' && event.getSender() !== matrix.getUserId();
  const isPrivateRoom =
    !!room &&
    !globalRoomNames(config).some((g) =>
      // generate an alias for global room of given name, and check if room matches
      roomMatch(`#${g}:${getServerName(matrix.getHomeserverUrl())}`, room),
    );
  const isToDevice = !room && !!getCap(config.caps, Capabilities.TO_DEVICE); // toDevice message
  return isTextMessage && (isPrivateRoom || isToDevice);
}

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
export function matrixMessageReceivedEpic(
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, matrix$, config$, latest$ }: RaidenEpicDeps,
): Observable<messageReceived> {
  // gets/wait for the user to be in a room, and then sendMessage
  return matrix$.pipe(
    // when matrix finishes initialization, register to matrix timeline events
    switchMap((matrix) =>
      merge(
        fromEvent<[MatrixEvent, Room]>(matrix, 'Room.timeline').pipe(
          map(([event, room]) => ({ matrix, event, room })),
        ),
        fromEvent<MatrixEvent>(matrix, 'toDeviceEvent').pipe(
          map((event) => ({ matrix, event, room: undefined })),
        ),
      ),
    ),
    withLatestFrom(config$),
    filter(isValidMessage),
    mergeMap(([{ event, room }, { httpTimeout }]) =>
      latest$.pipe(
        filter(({ presences, state }) => {
          const presence = getPresenceByUserId(presences, event.getSender());
          if (!presence) return false;
          const rooms = state.transport.rooms?.[presence.meta.address] ?? [];
          return !room || rooms.includes(room.roomId);
        }),
        take(1),
        // take up to an arbitrary timeout to presence status for the sender
        // AND the room in which this message was sent to be in sender's address room queue
        takeUntil(timer(httpTimeout)),
        mergeMap(({ presences }) => {
          const presence = getPresenceByUserId(presences, event.getSender())!;
          const lines: string[] = (event.getContent().body ?? '').split('\n');
          return scheduled(lines, asapScheduler).pipe(
            map((line) => {
              let message;
              if (event.getContent().msgtype === 'm.text')
                message = parseMessage(line, presence.meta.address, { log });
              return messageReceived(
                {
                  text: line,
                  ...(message ? { message } : {}),
                  ts: Date.now(),
                  userId: presence.payload.userId,
                  ...(room ? { roomId: room.roomId } : {}),
                  ...(event.getContent().msgtype ? { msgtype: event.getContent().msgtype } : {}),
                },
                presence.meta,
              );
            }),
          );
        }),
      ),
    ),
  );
}

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
export function deliveredEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer, latest$ }: RaidenEpicDeps,
): Observable<messageSend.request> {
  const cache = new LruCache<string, Signed<Delivered>>(32);
  return action$.pipe(
    filter(
      isMessageReceivedOfType([Signed(Processed), Signed(SecretRequest), Signed(SecretReveal)]),
    ),
    withLatestFrom(latest$),
    filter(
      ([action, { presences }]) =>
        action.meta.address in presences &&
        // skip if peer supports !Capabilities.DELIVERY
        !!getCap(presences[action.meta.address].payload.caps, Capabilities.DELIVERY),
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
}
