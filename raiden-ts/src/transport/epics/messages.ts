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
  groupBy,
  map,
  mergeMap,
  pluck,
  scan,
  share,
  startWith,
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
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { assert, networkErrors } from '../../utils/error';
import { LruCache } from '../../utils/lru';
import { getServerName } from '../../utils/matrix';
import {
  completeWith,
  concatBuffer,
  dispatchRequestAndGetResponse,
  mergeWith,
  pluckDistinct,
  retryWhile,
} from '../../utils/rx';
import type { Address } from '../../utils/types';
import { isntNil, Signed } from '../../utils/types';
import { matrixPresence } from '../actions';
import { getAddressFromUserId, getCap } from '../utils';
import { getRoom$, globalRoomNames, parseMessage } from './helpers';

function getMessageBody(message: string | Signed<Message>): string {
  return typeof message === 'string' ? message : encodeJsonMessage(message);
}

const textMsgType = 'm.text';

function getMsgType(request: messageSend.request): string {
  return request.payload.msgtype ?? textMsgType;
}

/** a messageSend.request which is guaranteed to have its payload.userId property set */
type requestWithUserId = messageSend.request & {
  payload: { userId: NonNullable<messageSend.request['payload']['userId']> };
};

// toDevice API can send multiple messages to multiple userIds+deviceIds, but for each, only a
// single `msgtype` is allowed; This function walks through the queue and on each call pops at most
// masBatchSize messages from as many recipients as needed as long as all messages popped for a
// peer are of the same msgtype; left messages will be picked on next iteration
function popMessagesOfSameType<T extends requestWithUserId>(
  queue: T[],
  maxBatchSize: number,
): Map<string, [T, ...T[]]> {
  let selectedCount = 0;
  // per userId message queues with at least one message (which defines chosen msgtype)
  const selected = new Map<string, [T, ...T[]]>();
  for (let i = 0; i < queue.length && selectedCount < maxBatchSize; i++) {
    const request = queue[i];
    // guaranteed to be defined from request$
    const peerId = request.payload.userId;
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

function flushQueueToDevice(queue: requestWithUserId[], deps: RaidenEpicDeps) {
  if (!queue.length) return EMPTY;
  const start = Date.now();
  // limit each batch size to prevent API errors if request's payload is too big
  const batch = popMessagesOfSameType(queue, 20);

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
          // FIXME: if possible, restore waiting for some condition which indicates the
          // peer has received the message; maybe an incoming message, rtc channel or presence
          yield of(messageSend.success({ via: peerId, tookMs, retries }, action.meta));
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
  action$: Observable<readonly [messageSend.request, string]>,
  deps: RaidenEpicDeps,
): Observable<messageSend.success | messageSend.failure> {
  const queue: requestWithUserId[] = [];
  return action$.pipe(
    tap(([action, userId]) => queue.push({ ...action, payload: { ...action.payload, userId } })),
    // like concatBuffer, but takes queue control in order to do custom batch selection
    concatMap(() => defer(() => flushQueueToDevice(queue, deps).pipe(completeWith(action$, 10)))),
    // notice the emitted elements are observables, which can be merged in the output *after*
    // the concatMap was released in order to "wait" for some condition before success|failure
    mergeMap((obs$: Observable<messageSend.success | messageSend.failure>) =>
      obs$.pipe(completeWith(action$, 10)),
    ),
  );
}

function sendNowToRtc(
  toRtc$: Observable<readonly [messageSend.request, RTCDataChannel]>,
): Observable<messageSend.success> {
  return toRtc$.pipe(
    map(([action, rtcChannel]) => {
      const start = Date.now();
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
): Observable<messageSend.success | messageSend.failure | matrixPresence.request> {
  return action$.pipe(
    dispatchRequestAndGetResponse(
      matrixPresence,
      (dispatch) => {
        const request$ = action$.pipe(
          filter(messageSend.request.is),
          // "holds" message until it can be handled: there's either a rtcChannel or presence for peer
          mergeWith((action) => {
            const address = action.meta.address;
            const rtc$ =
              getMsgType(action) !== textMsgType
                ? EMPTY // don't send through rtc if msgtype is text
                : deps.latest$.pipe(pluck('rtc', address), filter(isntNil));
            const userId$ = action.payload.userId
              ? of(action.payload.userId)
              : dispatch(matrixPresence.request(undefined, { address })).pipe(
                  pluck('payload', 'userId'),
                  catchError((err) => of(err as Error)),
                );
            return merge(rtc$, userId$).pipe(take(1), completeWith(action$));
          }),
          share(),
        );
        // split messages which can be sent right away through rtc and the ones which need to be queued
        // and sent through toDevice messages
        const [toRtc$, toDeviceOrError$] = partition(
          request$,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ([, rtcOrPresence]) => !!rtcOrPresence && (rtcOrPresence as any)?.readyState,
        ) as [
          Observable<readonly [messageSend.request, RTCDataChannel]>,
          Observable<readonly [messageSend.request, string | Error]>,
        ]; // partition isn't smart enough to detect the split condition, so we need to cast
        const [toDevice$, presenceError$] = partition(
          toDeviceOrError$,
          ([, userIdOrError]) => typeof userIdOrError === 'string',
        ) as [
          Observable<readonly [messageSend.request, string]>,
          Observable<readonly [messageSend.request, Error]>,
        ];

        const sendToRtc$ = sendNowToRtc(toRtc$);
        const sendToDevice$ = sendBatchedToDevice(toDevice$, deps);
        const presenceRequestErrored$ = presenceError$.pipe(
          map(([request, error]) => messageSend.failure(error, request.meta)),
        );
        return merge(presenceRequestErrored$, sendToRtc$, sendToDevice$);
      },
      undefined,
      ({ meta }) => meta.address, // deduplicate parallel matrixPresence.request's by address
    ),
  );
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
        pluckDistinct('whitelisted'),
        map((whitelisted) => {
          const address = getAddressFromUserId(event.getSender());
          // TODO: check if it's possible again to enforce message came from a client-side
          // validated userId presence, even though the messages signatures are already validated
          if (!!address && whitelisted.includes(address)) return address;
        }),
        filter(isntNil),
        take(1),
        // take up to an arbitrary timeout for sender to be whitelisted
        takeUntil(timer(httpTimeout)),
      ),
    ),
    completeWith(action$),
    mergeMap(([[event], senderAddress]) => {
      const lines: string[] = (event.getContent().body ?? '').split('\n');
      return scheduled(lines, asapScheduler).pipe(
        map((line) => {
          let message;
          if (event.getContent().msgtype === textMsgType)
            message = parseMessage(line, senderAddress, { log });
          return messageReceived(
            {
              text: line,
              ...(message ? { message } : {}),
              ts: Date.now(),
              userId: event.getSender(),
              ...(event.getContent().msgtype ? { msgtype: event.getContent().msgtype } : {}),
            },
            { address: senderAddress },
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
 * @returns Observable of messageSend.request actions
 */
export function deliveredEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, signer }: RaidenEpicDeps,
): Observable<messageSend.request> {
  const cache = new LruCache<string, Signed<Delivered>>(32);
  const noDelivery = new Set<Address>();
  return action$.pipe(
    filter(
      isMessageReceivedOfType([Signed(Processed), Signed(SecretRequest), Signed(SecretReveal)]),
    ),
    // aggregate seen matrixPresence.success addresses with !DELIVERY set;
    // if an address's presence hasn't been seen, it's assumed Delivered is needed
    withLatestFrom(
      action$.pipe(
        filter(matrixPresence.success.is),
        scan((acc, presence) => {
          if (!getCap(presence.payload.caps, Capabilities.DELIVERY))
            acc.add(presence.meta.address);
          else acc.delete(presence.meta.address);
          return acc;
        }, noDelivery),
        startWith(noDelivery),
      ),
    ),
    // skip iff peer supports !Capabilities.DELIVERY
    filter(([action, noDelivery]) => !noDelivery.has(action.meta.address)),
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
