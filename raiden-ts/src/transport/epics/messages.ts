import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import type { Observable } from 'rxjs';
import {
  asapScheduler,
  defer,
  EMPTY,
  from,
  fromEvent,
  merge,
  of,
  partition,
  scheduled,
  timer,
} from 'rxjs';
import {
  catchError,
  concatMap,
  filter,
  first,
  groupBy,
  map,
  mapTo,
  mergeMap,
  pluck,
  share,
  take,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import type { RaidenConfig } from '../../config';
import { intervalFromConfig } from '../../config';
import { Capabilities } from '../../constants';
import { messageReceived, messageSend, messageServiceSend } from '../../messages/actions';
import type { Delivered, Message } from '../../messages/types';
import { MessageType, Processed, SecretRequest, SecretReveal } from '../../messages/types';
import { encodeJsonMessage, isMessageReceivedOfType, signMessage } from '../../messages/utils';
import { Service } from '../../services/types';
import type { RaidenState } from '../../state';
import type { Latest, RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { assert, networkErrors } from '../../utils/error';
import { LruCache } from '../../utils/lru';
import { getServerName } from '../../utils/matrix';
import { completeWith, concatBuffer, mergeWith, retryWhile } from '../../utils/rx';
import { Signed } from '../../utils/types';
import type { Presences } from '../types';
import { getCap, getPresenceByUserId } from '../utils';
import { getRoom$, globalRoomNames, parseMessage } from './helpers';

function getMessageBody(message: string | Signed<Message>): string {
  return typeof message === 'string' ? message : encodeJsonMessage(message);
}

const textMsgType = 'm.text';

function getMsgType(request: messageSend.request): string {
  return request.payload.msgtype ?? textMsgType;
}

function canSendThroughRtc([action, { rtc }]: readonly [
  messageSend.request,
  Pick<Latest, 'rtc'>,
]) {
  return getMsgType(action) === textMsgType && rtc[action.meta.address]?.readyState === 'open';
}

// toDevice API can send multiple messages to multiple userIds+deviceIds, but for each, only a
// single `msgtype` is allowed; This function walks through the queue and on each call pops at most
// masBatchSize messages from as many recipients as needed as long as all messages popped for a
// peer are of the same msgtype; left messages will be picked on next iteration
function popMessagesOfSameType<T extends messageSend.request>(
  queue: T[],
  presences: Latest['presences'],
  maxBatchSize: number,
): Map<string, [T, ...T[]]> {
  let selectedCount = 0;
  // per userId message queues with at least one message (which defines chosen msgtype)
  const selected = new Map<string, [T, ...T[]]>();
  for (let i = 0; i < queue.length && selectedCount < maxBatchSize; i++) {
    const request = queue[i];
    // guaranteed to be defined from request$
    const peerId = presences[request.meta.address].payload.userId;
    const peerQueue = selected.get(peerId);

    const msgTypeDiffersPeerQueue = peerQueue && getMsgType(request) !== getMsgType(peerQueue[0]);
    if (msgTypeDiffersPeerQueue) continue;

    queue.splice(i--, 1);
    if (!peerQueue) selected.set(peerId, [request]);
    else peerQueue.push(request);
    selectedCount++;
  }
  return selected;
}

function flushQueueToDevice(
  queue: messageSend.request[],
  presences: Presences,
  deps: RaidenEpicDeps,
) {
  if (!queue.length) return EMPTY;
  const start = Date.now();
  // limit each batch size to prevent API errors if request's payload is too big
  const batch = popMessagesOfSameType(queue, presences, 20);

  const payload: {
    [peerId: string]: { [deviceId: string]: { msgtype: string; body: string } };
  } = {};
  for (const [peerId, peerQueue] of batch) {
    // several messages can be batched in a single body, as long as they share same msgtype
    const body = peerQueue.map((action) => getMessageBody(action.payload.message)).join('\n');
    const content = { msgtype: getMsgType(peerQueue[0]), body };
    payload[peerId] = { ['*']: content };
  }

  let retries = -1;
  return deps.matrix$.pipe(
    mergeMap(async (matrix) => {
      retries++;
      return matrix.sendToDevice('m.room.message', payload);
    }),
    retryWhile(intervalFromConfig(deps.config$), {
      maxRetries: 3,
      onErrors: networkErrors,
      log: deps.log.warn,
    }),
    // a higher-order observable is used to be able to have requests serialized/batched,
    // but return observables for success/failures which will resolve independently when peer comes
    // online, and get merged in parallel at the end to avoid holding concatMap
    mergeMap(function* () {
      const tookMs = Date.now() - start;
      for (const [peerId, peerQueue] of batch) {
        for (const action of peerQueue) {
          // wait independently on each peer's presence when resolving to success
          yield deps.latest$.pipe(
            filter(({ presences }) => presences[action.meta.address].payload.available),
            take(1),
            mapTo(messageSend.success({ via: peerId, tookMs, retries }, action.meta)),
          );
        }
      }
    }),
    catchError(function* (err) {
      for (const [, peerQueue] of batch) {
        for (const action of peerQueue) {
          // if failure, fail all queued responses at once, no need to wait
          yield of(messageSend.failure(err, action.meta));
        }
      }
    }),
  );
}

function sendBatchedToDevice(
  action$: Observable<messageSend.request>,
  deps: RaidenEpicDeps,
): Observable<messageSend.success | messageSend.failure> {
  const queue: messageSend.request[] = [];
  return action$.pipe(
    tap((action) => queue.push(action)),
    // like concatBuffer, but takes queue control in order to do custom batch selection
    concatMap(() =>
      deps.latest$.pipe(
        first(),
        // completeWith with some delay gives a minimal time for queue to be flushed
        mergeMap(({ presences }) =>
          flushQueueToDevice(queue, presences, deps).pipe(completeWith(action$, 10)),
        ),
      ),
    ),
    // notice the emitted elements are observables, which can be merged in the output *after*
    // the concatMap was released in order to "wait" for some condition before success|failure
    mergeMap((obs$: Observable<messageSend.success | messageSend.failure>) =>
      obs$.pipe(completeWith(action$, 10)),
    ),
  );
}

function sendNowToRtc(
  toRtc$: Observable<[messageSend.request, Pick<Latest, 'rtc'>]>,
): Observable<messageSend.success> {
  return toRtc$.pipe(
    map(([action, { rtc }]) => {
      const start = Date.now();
      const rtcChannel = rtc[action.meta.address]; // guaranteed to be defined from request$
      rtcChannel.send(getMessageBody(action.payload.message));
      const payload = { via: rtcChannel.label, tookMs: Date.now() - start, retries: 0 };
      return messageSend.success(payload, action.meta);
    }),
  );
}

/**
 * Handles a [[messageSend.request]] action and send its message to peer through rtcChannel or
 * toDevice
 *
 * @param action$ - Observable of messageSend.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @returns Observable of messageSend.success | messageSend.failure actions
 */
export function matrixMessageSendEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<messageSend.success | messageSend.failure> {
  const request$ = action$.pipe(
    filter(messageSend.request.is),
    // "holds" message until it can be handled: there's either a rtcChannel or presence for peer
    mergeWith((action) =>
      deps.latest$.pipe(
        filter(
          ({ rtc, presences }) =>
            canSendThroughRtc([action, { rtc }]) || action.meta.address in presences,
        ),
        take(1),
        completeWith(action$),
      ),
    ),
    share(),
  );
  // split messages which can be sent right away through rtc and the ones which need to be queued
  // and sent through toDevice messages
  const [toRtc$, toDevice$] = partition(request$, canSendThroughRtc);

  const sendToRtc$ = sendNowToRtc(toRtc$);
  const sendToDevice$ = sendBatchedToDevice(toDevice$.pipe(pluck(0)), deps);
  return merge(sendToRtc$, sendToDevice$);
}

function sendGlobalMessages(
  actions: readonly messageServiceSend.request[],
  matrix: MatrixClient,
  config: RaidenConfig,
  { config$ }: Pick<RaidenEpicDeps, 'config$'>,
): Observable<messageServiceSend.success['payload']> {
  const servicesToRoomName = {
    [Service.PFS]: config.pfsRoom,
    [Service.MS]: config.monitoringRoom,
  };
  const roomName = servicesToRoomName[actions[0].meta.service];
  const globalRooms = globalRoomNames(config);
  assert(roomName && globalRooms.includes(roomName), [
    'messageServiceSend for unknown global room',
    { roomName, globalRooms: globalRooms.join(',') },
  ]);
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
      await matrix.sendEvent(room.roomId, 'm.room.message', { body, msgtype: textMsgType }, '');
      return { via: room.roomId, tookMs: Date.now() - start, retries };
    }),
    retryWhile(intervalFromConfig(config$), { maxRetries: 3, onErrors: networkErrors }),
  );
}

/**
 * Handles a [[messageServiceSend.request]] action and send one-shot message to a global room
 *
 * @param action$ - Observable of messageServiceSend actions
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
): Observable<messageServiceSend.success | messageServiceSend.failure> {
  const { matrix$, config$ } = deps;
  return action$.pipe(
    filter(isActionOf(messageServiceSend.request)),
    groupBy((action) => action.meta.service),
    mergeMap((grouped$) =>
      grouped$.pipe(
        concatBuffer((actions) => {
          return matrix$.pipe(
            withLatestFrom(config$),
            mergeMap(([matrix, config]) => sendGlobalMessages(actions, matrix, config, deps)),
            mergeMap((payload) =>
              from(actions.map((action) => messageServiceSend.success(payload, action.meta))),
            ),
            catchError((err) =>
              from(actions.map((action) => messageServiceSend.failure(err, action.meta))),
            ),
            completeWith(action$, 10),
          );
        }, 20),
      ),
    ),
  );
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
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, matrix$, config$, latest$ }: RaidenEpicDeps,
): Observable<messageReceived> {
  // gets/wait for the user to be in a room, and then sendMessage
  return matrix$.pipe(
    // when matrix finishes initialization, register to matrix timeline events
    mergeWith((matrix) => fromEvent<MatrixEvent>(matrix, 'toDeviceEvent')),
    filter(
      ([matrix, event]) =>
        event.getType() === 'm.room.message' && event.getSender() !== matrix.getUserId(),
    ),
    pluck(1),
    withLatestFrom(config$),
    mergeWith(([event, { httpTimeout }]) =>
      latest$.pipe(
        filter(({ presences }) => !!getPresenceByUserId(presences, event.getSender())),
        take(1),
        // take up to an arbitrary timeout to know presence status (monitor) from sender
        takeUntil(timer(httpTimeout)),
      ),
    ),
    completeWith(action$),
    mergeMap(([[event], { presences }]) => {
      const presence = getPresenceByUserId(presences, event.getSender())!;
      const lines: string[] = (event.getContent().body ?? '').split('\n');
      return scheduled(lines, asapScheduler).pipe(
        map((line) => {
          let message;
          if (event.getContent().msgtype === textMsgType)
            message = parseMessage(line, presence.meta.address, { log });
          return messageReceived(
            {
              text: line,
              ...(message ? { message } : {}),
              ts: Date.now(),
              userId: presence.payload.userId,
              ...(event.getContent().msgtype ? { msgtype: event.getContent().msgtype } : {}),
            },
            presence.meta,
          );
        }),
      );
    }),
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
          tap((signed) => cache.set(key, signed)),
          map((signed) =>
            messageSend.request({ message: signed }, { address: action.meta.address, msgId: key }),
          ),
        );
      });
    }),
  );
}
