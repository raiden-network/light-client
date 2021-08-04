import * as t from 'io-ts';
import constant from 'lodash/constant';
import type { MatrixClient } from 'matrix-js-sdk';
import type { Observable, ObservedValueOf, OperatorFunction } from 'rxjs';
import {
  asapScheduler,
  AsyncSubject,
  defer,
  EMPTY,
  from,
  fromEvent,
  merge,
  of,
  pipe,
  Subject,
  throwError,
  timer,
} from 'rxjs';
import {
  bufferTime,
  catchError,
  delayWhen,
  endWith,
  exhaustMap,
  filter,
  finalize,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  mergeMapTo,
  observeOn,
  pluck,
  retryWhen,
  startWith,
  switchMap,
  take,
  takeUntil,
  takeWhile,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenConfig } from '../..';
import type { RaidenAction } from '../../actions';
import { channelMonitored } from '../../channels/actions';
import { Capabilities } from '../../constants';
import { messageReceived, messageSend } from '../../messages/actions';
import { parseMessage } from '../../messages/utils';
import type { RaidenState } from '../../state';
import { transferSigned } from '../../transfers/actions';
import { dispatchAndWait$ } from '../../transfers/epics/utils';
import { Direction } from '../../transfers/state';
import { makeMessageId } from '../../transfers/utils';
import type { RaidenEpicDeps } from '../../types';
import { isResponseOf } from '../../utils/actions';
import { jsonParse, jsonStringify } from '../../utils/data';
import { assert, matchError } from '../../utils/error';
import {
  completeWith,
  dispatchRequestAndGetResponse,
  mergeWith,
  partitionMap,
  takeIf,
  timeoutFirst,
} from '../../utils/rx';
import type { Address } from '../../utils/types';
import { decode, isntNil, last } from '../../utils/types';
import { matrixPresence, rtcChannel } from '../actions';
import { getCap, getSeenPresences } from '../utils';

interface CallInfo {
  callId: string;
  readonly peer: matrixPresence.success;
}
const rtcMatrixMsgType = 'm.notice';

enum RtcEventType {
  offer = 'offer',
  answer = 'answer',
  candidates = 'candidates',
  hangup = 'hangup',
}

const RtcOffer = t.readonly(
  t.intersection([
    t.type({ type: t.literal(RtcEventType.offer), sdp: t.string }),
    t.partial({ call_id: t.string }),
  ]),
);

const RtcAnswer = t.readonly(
  t.intersection([
    t.type({ type: t.literal(RtcEventType.answer), sdp: t.string }),
    t.partial({ call_id: t.string }),
  ]),
);

const RtcCandidates = t.readonly(
  t.intersection([
    t.type({ type: t.literal(RtcEventType.candidates), candidates: t.readonlyArray(t.unknown) }),
    t.partial({ call_id: t.string }),
  ]),
);

const RtcHangup = t.readonly(
  t.intersection([
    t.type({ type: t.literal(RtcEventType.hangup) }),
    t.partial({ call_id: t.string }),
  ]),
);

const rtcCodecs = {
  [RtcEventType.offer]: RtcOffer,
  [RtcEventType.answer]: RtcAnswer,
  [RtcEventType.candidates]: RtcCandidates,
  [RtcEventType.hangup]: RtcHangup,
} as const;

type ConnectionInfo = readonly [RTCPeerConnection, RTCDataChannel, CallInfo];
function isConnectionInfo(value: unknown): value is ConnectionInfo {
  return Array.isArray(value) && value.length === 3 && value[1]?.readyState;
}

const hangUpError = 'peer hung up';
const closedError = 'channel closed';
const pingMsg = 'ping';
const failedConnectionStates = ['failed', 'closed', 'disconnected'];

const enum Role {
  caller = 'caller',
  callee = 'callee',
}
type ChannelRequest = readonly [
  peer: Address,
  role: Role,
  channel$: ReturnType<typeof rtcConnectionManagerEpic>,
];
type ChannelUpdate = readonly [put: boolean, channel: RTCDataChannel, error?: Error];

// fetches and caches matrix set turnServer
const _matrixIceServersCache = new WeakMap<MatrixClient, [number, RTCIceServer[]]>();
async function getMatrixIceServers(matrix: MatrixClient): Promise<RTCIceServer[]> {
  const cached = _matrixIceServersCache.get(matrix);
  if (cached && Date.now() < cached[0]) return cached[1];
  const fetched = (await matrix.turnServer().catch(() => undefined)) as unknown as
    | {
        uris: string | string[];
        ttl: number;
        username: string;
        password: string;
      }
    | undefined;
  // if request returns nothing, caches empty list for 1h
  let expire = Date.now() + 36e5;
  const servers: RTCIceServer[] = [];
  if (fetched && 'uris' in fetched) {
    servers.push({
      urls: fetched.uris,
      username: fetched.username,
      credentialType: 'password',
      credential: fetched.password,
    });
    expire = Date.now() + fetched.ttl * 1e3;
  }
  _matrixIceServersCache.set(matrix, [expire, servers]);
  return servers;
}

// returns a stream of filtered, valid Rtc events coming on matrix messages
function matrixWebrtcEvents$<T extends RtcEventType>(
  action$: Observable<RaidenAction>,
  type: T,
  { peer, callId }: Readonly<Omit<CallInfo, 'callId'> & Partial<Pick<CallInfo, 'callId'>>>,
  { log }: Partial<Pick<RaidenEpicDeps, 'log'>> = {},
) {
  return action$.pipe(
    filter(messageReceived.is),
    filter(
      ({ meta, payload }) =>
        meta.address === peer.meta.address && payload.msgtype === rtcMatrixMsgType,
    ),
    mergeMap(function* (action) {
      try {
        const json = jsonParse(action.payload.text);
        if (json['type'] === type) yield decode(rtcCodecs[type], json);
      } catch (error) {
        log?.info('Failed to decode WebRTC signaling message, ignoring', {
          text: action.payload.text,
          peerAddr: action.meta.address,
          peerId: action.payload.userId!,
          error,
        });
      }
    }),
    filter((e) => !callId || e.call_id === callId),
  );
}

// setup candidates$ handlers: receives & sets candidates from peer, sends ours to them
function handleCandidates$(
  connection: RTCPeerConnection,
  action$: Observable<RaidenAction>,
  info: Readonly<CallInfo>,
  { log }: Pick<RaidenEpicDeps, 'log'>,
) {
  return merge(
    // when receiving candidates from peer, add it locally
    matrixWebrtcEvents$(action$, RtcEventType.candidates, info, { log }).pipe(
      tap((e) => log.debug('RTC: received candidates', info.callId, e.candidates)),
      mergeMap((event) => from((event.candidates ?? []) as RTCIceCandidateInit[])),
      mergeMap(async (candidate) => {
        try {
          await connection.addIceCandidate(candidate);
        } catch (err) {
          log.warn(
            'RTC: error setting candidate, ignoring',
            info.callId,
            connection.connectionState,
            candidate,
            err,
          );
        }
      }),
      ignoreElements(),
    ),
    // when seeing an icecandidate, send it to peer
    fromEvent<RTCPeerConnectionIceEvent>(connection, 'icecandidate').pipe(
      pluck('candidate'),
      takeWhile(isntNil),
      bufferTime(10),
      filter((candidates) => candidates.length > 0),
      tap((e) => log.debug('RTC: got candidates', info.callId, e)),
      map((candidates) => {
        const body: t.TypeOf<typeof RtcCandidates> = {
          type: RtcEventType.candidates,
          candidates,
          call_id: info.callId,
        };
        return messageSend.request(
          {
            message: jsonStringify(body),
            msgtype: rtcMatrixMsgType,
            userId: info.peer.payload.userId,
          },
          { address: info.peer.meta.address, msgId: makeMessageId().toString() },
        );
      }),
    ),
  );
}

// extracted helper of [listenDataChannel]
function makeDataChannelObservable(
  [connection, dataChannel, info]: ConnectionInfo,
  [action$, open$]: [Observable<RaidenAction>, Subject<true>],
  { httpTimeout }: Pick<RaidenConfig, 'httpTimeout'>,
  deps: RaidenEpicDeps,
) {
  return merge(
    fromEvent<Event>(connection, 'connectionstatechange').pipe(
      startWith(null),
      mergeMap(() => {
        if (failedConnectionStates.includes(connection.connectionState))
          throw new Error('RTC: connection failed');
        return EMPTY;
      }),
    ),
    fromEvent<Event>(dataChannel, 'close').pipe(
      mergeMapTo(throwError(() => new Error(closedError))),
    ),
    fromEvent<RTCErrorEvent>(dataChannel, 'error').pipe(
      mergeMap((ev) => {
        throw ev.error;
      }),
    ),
    matrixWebrtcEvents$(action$, RtcEventType.hangup, info, deps).pipe(
      mergeMapTo(throwError(() => new Error(hangUpError))),
    ),
    fromEvent<Event>(dataChannel, 'open').pipe(
      take(1),
      timeoutFirst(httpTimeout),
      map(() => {
        deps.log.info('RTC: dataChannel open', dataChannel.label);
        info.callId = dataChannel.label;
        // when connected, sends a first message
        dataChannel.send(pingMsg);
        open$.next(true);
        open$.complete();
        return rtcChannel(dataChannel, info.peer.meta);
      }),
    ),
    fromEvent<MessageEvent>(dataChannel, 'message').pipe(
      tap((e) => deps.log.debug('RTC: dataChannel message', dataChannel.label, e)),
      pluck('data'),
      filter((d: unknown): d is string => typeof d === 'string'),
      // ignore pingMsg, used only to succeed rtcChannel
      filter((line) => line !== pingMsg),
      mergeMap((lines) => from(lines.split('\n'))),
      observeOn(asapScheduler),
      map((line) =>
        messageReceived(
          {
            text: line,
            message: parseMessage(line, info.peer, deps),
            ts: Date.now(),
            userId: info.peer.payload.userId,
          },
          info.peer.meta,
        ),
      ),
    ),
  ).pipe(finalize(() => connection.close()));
}

// setup listeners & events for a data channel, when it gets opened, and teardown when closed
function listenDataChannel<T>(
  action$: Observable<RaidenAction>,
  deps: RaidenEpicDeps,
): OperatorFunction<T | ConnectionInfo, T | rtcChannel | messageReceived> {
  const { config$ } = deps;
  return (source$) => {
    let open$: AsyncSubject<true>;
    return defer(() => {
      open$ = new AsyncSubject<true>();
      return source$.pipe(takeUntil(open$));
    }).pipe(
      // partitionMap will send only ConnectionInfo tuples to pipe below, and passthrough the rest
      partitionMap(
        isConnectionInfo,
        pipe(
          withLatestFrom(config$),
          switchMap(([connection, config]) =>
            makeDataChannelObservable(connection, [action$, open$], config, deps),
          ),
        ),
      ),
    );
  };
}

// make an observable which answers an incoming call when subscribed
function makeCalleeAnswer$(
  action$: Observable<RaidenAction>,
  [peer, offer]: [matrixPresence.success, t.TypeOf<typeof RtcOffer>],
  deps: RaidenEpicDeps,
): Observable<rtcChannel | messageReceived | messageSend.request> {
  const { matrix$, config$, log } = deps;
  const info: CallInfo = {
    callId: offer.call_id!,
    peer,
  };
  log.info('RTC: callee answering', info);
  const start$ = new AsyncSubject<true>();

  return matrix$.pipe(
    mergeMap(async (matrix) => getMatrixIceServers(matrix)),
    withLatestFrom(config$),
    mergeMap(([matrixIce, { fallbackIceServers: fallback }]) => {
      const connection = new RTCPeerConnection({ iceServers: matrixIce.concat(fallback) });
      let emitted = 0;
      return merge(
        handleCandidates$(connection, action$, info, deps).pipe(delayWhen(constant(start$))),
        defer(async () => connection.setRemoteDescription(offer)).pipe(
          mergeMap(async () => connection.createAnswer()),
          mergeWith(async (answer) => connection.setLocalDescription(answer)),
          mergeMap(([answer]) => {
            const body: t.TypeOf<typeof RtcAnswer> = {
              type: answer.type as RtcEventType.answer,
              sdp: answer.sdp!,
              call_id: info.callId,
            };
            // send answer, complete when response goes through; no need to forward
            // the success
            const request = messageSend.request(
              {
                message: jsonStringify(body),
                msgtype: rtcMatrixMsgType,
                userId: peer.payload.userId,
              },
              { ...peer.meta, msgId: makeMessageId().toString() },
            );
            // send answer, complete when response goes through
            return dispatchAndWait$(action$, request, isResponseOf(messageSend, request.meta));
          }),
          finalize(() => (start$.next(true), start$.complete())),
        ),
        fromEvent<RTCDataChannelEvent>(connection, 'datachannel').pipe(
          map(({ channel }) => (++emitted, [connection, channel, info] as const)),
          take(1),
          // if switchMap unsubscribes before datachannel got emitted, release
          // connection
          finalize(() => (!emitted ? connection.close() : null)),
        ),
      );
    }),
    listenDataChannel(action$, deps),
  );
}

// extracted helper of [makeCallerObservable]
function makeOfferWaitAnswer(
  request: messageSend.request,
  connInfo: ConnectionInfo,
  [action$, start$]: readonly [Observable<RaidenAction>, Subject<true>],
  deps: RaidenEpicDeps,
) {
  return merge(
    // wait for answer
    matrixWebrtcEvents$(action$, RtcEventType.answer, connInfo[2], deps).pipe(
      take(1),
      mergeMap(async (event) => {
        deps.log.info('RTC: got answer', event.call_id);
        await connInfo[0].setRemoteDescription(event);
        // output created channel when the offer has been sent
        return connInfo;
      }),
      finalize(() => (start$.next(true), start$.complete())),
    ),
    // send invite with offer, complete when success goes through
    dispatchAndWait$(action$, request, isResponseOf(messageSend, request.meta)).pipe(
      endWith(connInfo),
    ),
  );
}

// extracted helper of [makeCallerCall$]
function makeCallerObservable(
  peer: matrixPresence.success,
  action$: Observable<RaidenAction>,
  deps: RaidenEpicDeps,
) {
  const { matrix$, config$, log, address } = deps;
  return matrix$.pipe(
    mergeMap(async (matrix) => getMatrixIceServers(matrix)),
    withLatestFrom(config$),
    mergeMap(([matrixIce, { fallbackIceServers: fallback }]) => {
      const info: CallInfo = {
        callId: `${address}|${peer.meta.address}|${Date.now()}`,
        peer,
      };
      log.info('RTC: caller calling', info);
      const connection = new RTCPeerConnection({ iceServers: matrixIce.concat(fallback) });
      const dataChannel = connection.createDataChannel(info.callId, { ordered: false });
      // start$ indicates invite/answer cycle completed, and candidates can be exchanged
      const start$ = new AsyncSubject<true>();
      let emitted = 0;

      return merge(
        handleCandidates$(connection, action$, info, deps).pipe(delayWhen(constant(start$))),
        defer(async () => connection.createOffer()).pipe(
          mergeMap(async (offer) => (await connection.setLocalDescription(offer), offer)),
          mergeMap((offer) => {
            const body: t.TypeOf<typeof RtcOffer> = {
              type: offer.type as RtcEventType.offer,
              sdp: offer.sdp!,
              call_id: info.callId,
            };
            const request = messageSend.request(
              {
                message: jsonStringify(body),
                msgtype: rtcMatrixMsgType,
                userId: info.peer.payload.userId,
              },
              { address: info.peer.meta.address, msgId: makeMessageId().toString() },
            );
            return makeOfferWaitAnswer(
              request,
              [connection, dataChannel, info],
              [action$, start$],
              deps,
            );
          }),
        ),
      ).pipe(
        filter((value) => (isConnectionInfo(value) ? !emitted++ : true)),
        finalize(() => (!emitted ? connection.close() : null)),
      );
    }),
    listenDataChannel(action$, deps),
  );
}

// make an observable which calls peer when subscribed
function makeCallerCall$(
  action$: Observable<RaidenAction>,
  peer: Address,
  deps: RaidenEpicDeps,
): Observable<rtcChannel | messageReceived | messageSend.request | matrixPresence.request> {
  return action$.pipe(
    dispatchRequestAndGetResponse(matrixPresence, (dispatch) =>
      dispatch(matrixPresence.request(undefined, { address: peer })).pipe(
        mergeMap((presence) => {
          assert(getCap(presence.payload.caps, Capabilities.WEBRTC), "peer doesn't support RTC");
          return makeCallerObservable(presence, action$, deps);
        }),
      ),
    ),
  );
}

// manage stream of callee observables and subscribe to them when needed
function manageCalleeChannel(
  peer: Address,
  setChannel: Subject<ChannelUpdate>,
  { log }: Pick<RaidenEpicDeps, 'log'>,
): OperatorFunction<ChannelRequest, ObservedValueOf<ChannelRequest[2]>> {
  return pipe(
    // switchMap *unsubscribes* previous incoming call
    switchMap(([, , channel$]) => {
      let channel: RTCDataChannel | undefined;
      let error: Error | undefined;
      return channel$.pipe(
        tap((action) => {
          if (!channel && rtcChannel.is(action) && action.payload)
            setChannel.next([true, (channel = action.payload)]);
        }),
        catchError((err) => {
          log.info('RTC: callee channel error', peer, err.message);
          error = err;
          return EMPTY;
        }),
        finalize(() => {
          log.info('RTC: callee disconnecting', peer);
          if (channel) setChannel.next([false, channel, error]);
        }),
        // give up if annother channel (caller) gets established
        takeUntil(setChannel.pipe(filter(([put, channel_]) => put && channel_ !== channel))),
      );
    }),
  );
}

// manage stream of caller observables and subscribe to them when needed
function manageCallerChannel(
  peer: Address,
  setChannel: Subject<ChannelUpdate>,
  { log, config$ }: Pick<RaidenEpicDeps, 'log' | 'config$'>,
): OperatorFunction<ChannelRequest, ObservedValueOf<ChannelRequest[2]>> {
  return pipe(
    // exhaustMap *ignores* new call requests if one is already running
    exhaustMap(([, , channel$]) => {
      let channel: RTCDataChannel | undefined;
      let error: Error | undefined;
      return defer(() => {
        // upon retrying/re-subscribing, reset channel & error;
        channel = undefined;
        error = undefined;
        return channel$.pipe(
          tap({
            next(action) {
              if (!channel && rtcChannel.is(action) && action.payload)
                setChannel.next([true, (channel = action.payload)]);
            },
            error(err) {
              log.info('RTC: caller channel error', peer, err.message);
              error = err;
            },
          }),
          finalize(() => {
            if (channel) setChannel.next([false, channel, error]);
          }),
        );
      }).pipe(
        retryWhen(
          pipe(
            withLatestFrom(config$),
            mergeMap(([, { pollingInterval, httpTimeout }], retryCount) => {
              if (retryCount >= 5) return of(true);
              const delay = Math.min(pollingInterval * Math.pow(2, retryCount), httpTimeout * 2);
              log.info('RTC: caller retrying in', delay, peer, retryCount);
              return timer(delay);
            }),
            takeWhile((val) => val !== true),
            finalize(() => log.info('RTC: caller giving up', peer)),
          ),
        ),
        // give up if another channel (callee) gets established
        takeUntil(setChannel.pipe(filter(([put, channel_]) => put && channel_ !== channel))),
      );
    }),
  );
}

// operator to map stream of RaidenActions to incoming calls (received message and decoded offer)
function mapRtcMessage(): OperatorFunction<
  RaidenAction,
  readonly [matrixPresence.success, t.TypeOf<typeof RtcOffer>]
> {
  return (action$) =>
    action$.pipe(
      filter(messageReceived.is),
      withLatestFrom(action$.pipe(getSeenPresences())),
      filter(
        ([action, seenPresences]) =>
          action.payload.msgtype === rtcMatrixMsgType &&
          !!action.payload.userId &&
          // messageReceived is emitted iff we've seen & validated peer's presence, but we add
          // a check that it's present here just to be sure
          action.payload.userId in seenPresences,
      ),
      mergeMap(function* ([action, seenPresences]) {
        try {
          const json = jsonParse(action.payload.text);
          if (json['type'] === RtcEventType.offer)
            yield [
              seenPresences[action.payload.userId!],
              decode(rtcCodecs[RtcEventType.offer], json),
            ] as const;
        } catch (error) {}
      }),
    );
}

// from actions, choose peers which whom we should attempt to [re]establish RTC channels
function getAddressOfInterest(action: RaidenAction, { address }: Pick<RaidenEpicDeps, 'address'>) {
  let peer: Address | undefined;
  if (channelMonitored.is(action)) peer = action.meta.partner;
  else if (transferSigned.is(action)) {
    if (
      action.meta.direction === Direction.RECEIVED &&
      action.payload.message.target === address &&
      !('secret' in (action.payload.message.metadata as Record<string, unknown>))
    )
      peer = action.payload.message.initiator;
  } else if (messageSend.request.is(action) && action.payload.msgtype !== rtcMatrixMsgType) {
    peer = action.meta.address;
  } else if (rtcChannel.is(action) && !action.payload) {
    // payload=undefined is only emitted when the last valid RTC connection with this peer got
    // closed, so let's attempt to call them
    peer = action.meta.address;
  }
  return peer;
}

// adds channel to peer's channel queue when open/put; pops, reset & send hangup when closed
function mapChannelUpdateReset(
  peer: Address,
  channels: RTCDataChannel[],
): OperatorFunction<ChannelUpdate, rtcChannel | messageSend.request> {
  return pipe(
    mergeMap(function* ([put, channel, err]) {
      if (put) {
        channels.push(channel);
        return;
      }
      if (last(channels) === channel) {
        channels.pop();
        yield rtcChannel(last(channels), { address: peer });
      } else {
        const idx = channels.indexOf(channel);
        if (idx >= 0) channels.splice(idx, 1); // else should never happen
      }
      if (!matchError([hangUpError, closedError], err)) {
        const body: t.TypeOf<typeof RtcHangup> = {
          type: RtcEventType.hangup,
          call_id: channel.label,
        };
        yield messageSend.request(
          { message: jsonStringify(body), msgtype: rtcMatrixMsgType },
          { address: peer, msgId: makeMessageId().toString() },
        );
      }
    }),
  );
}

/**
 * Creates and manages WebRTC connection requests
 *
 * For whitelisted peers, it'll always listen for 'offer' messages and answer to try to establish
 * the RTC channel. If a new one comes while the previous is waiting, it'll teardown the previous
 * request and answer the new.
 * For Raiden channel partners (on startup/channelOpen), targets, initiators and also upon new
 * messageSend.requests, it's checked if the peer is online, and in parallel with any callee
 * handling, a call is initiated, times out after a few seconds and is retried a few times (to be
 * retried again in any of the above events). The winner channel of the callee/caller race is used.
 *
 * @param action$ - Observable of RaidenActions
 * @param deps - Epics dependencies
 * @returns Observable of rtcChannel|messageSend.request|messageReceived|matrixPresence.request
 *      actions
 */
export function rtcConnectionManagerEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<rtcChannel | messageSend.request | messageReceived | matrixPresence.request> {
  // observable of observables, created when *receiving* a call
  const asCallee$: Observable<ChannelRequest> = action$.pipe(
    mapRtcMessage(),
    map(([action, offer]) => [
      action.meta.address,
      Role.callee,
      makeCalleeAnswer$(action$, [action, offer], deps),
    ]),
  );
  // observable of observables, created upon certain events which triggers us to try to call peer
  const asCaller$: Observable<ChannelRequest> = action$.pipe(
    // allow RTC connect to neighbors, initiators for received and targets for sent transfers
    mergeMap(function* (action): Iterable<Address> {
      const peerAddress = getAddressOfInterest(action, deps);
      if (peerAddress) yield peerAddress;
    }),
    map((peer) => [peer, Role.caller, makeCallerCall$(action$, peer, deps)]),
  );

  return merge(asCallee$, asCaller$).pipe(
    groupBy(([peer]) => peer),
    mergeMap((perPeer$) => {
      const peer = perPeer$.key;
      const channels: RTCDataChannel[] = []; // peer's channels
      const setChannel = new Subject<ChannelUpdate>();

      return merge(
        perPeer$.pipe(
          groupBy(([, role]) => role),
          mergeMap((perRole$) =>
            perRole$.key === Role.callee
              ? perRole$.pipe(manageCalleeChannel(peer, setChannel, deps))
              : perRole$.pipe(
                  filter(() => !channels.length), // don't call if there's already an open channel
                  manageCallerChannel(peer, setChannel, deps),
                ),
          ),
          completeWith(action$),
          finalize(() => setTimeout(() => setChannel.complete(), 10)),
        ),
        setChannel.pipe(mapChannelUpdateReset(peer, channels)),
      );
    }),
    takeIf(deps.config$.pipe(pluck('caps', Capabilities.WEBRTC), completeWith(action$))),
  );
}
