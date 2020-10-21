import {
  Observable,
  from,
  of,
  EMPTY,
  fromEvent,
  timer,
  throwError,
  merge,
  defer,
  AsyncSubject,
  Subject,
  OperatorFunction,
  asapScheduler,
} from 'rxjs';
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
  takeUntil,
  tap,
  finalize,
  pluck,
  repeatWhen,
  delayWhen,
  takeWhile,
  bufferTime,
  endWith,
  mergeMapTo,
  startWith,
  first,
  mapTo,
  observeOn,
} from 'rxjs/operators';
import * as t from 'io-ts';

import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';

import { Capabilities } from '../../constants';
import { Address, decode, isntNil } from '../../utils/types';
import { jsonParse, jsonStringify } from '../../utils/data';
import { timeoutFirst } from '../../utils/rx';
import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import { exponentialBackoff } from '../../transfers/epics/utils';
import { RaidenConfig } from '../../config';
import { messageReceived } from '../../messages/actions';
import { RaidenState } from '../../state';
import { matrixPresence, rtcChannel } from '../actions';
import { getCap } from '../utils';
import { waitMemberAndSend$, parseMessage } from './helpers';

type CallInfo = { callId: string; peerId: string; peerAddress: Address };

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

// fetches and caches matrix set turnServer
const _matrixIceServersCache = new WeakMap<MatrixClient, [number, RTCIceServer[]]>();
async function getMatrixIceServers(matrix: MatrixClient): Promise<RTCIceServer[]> {
  const cached = _matrixIceServersCache.get(matrix);
  if (cached && Date.now() < cached[0]) return cached[1];
  const fetched = ((await matrix.turnServer().catch(() => undefined)) as unknown) as
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

type ExtMatrixEvent = MatrixEvent & {
  getContent: () => { msgtype: string; body: string };
};

// returns a stream of filtered, valid MatrixEvents
function matrixWebrtcEvents$<T extends RtcEventType>(
  matrix: MatrixClient,
  type: T,
  sender: string,
  { caps }: Pick<RaidenConfig, 'caps'>,
) {
  return merge(
    fromEvent<[MatrixEvent]>(matrix, 'Room.timeline').pipe(pluck(0)),
    getCap(caps, Capabilities.TO_DEVICE) ? fromEvent<MatrixEvent>(matrix, 'toDeviceEvent') : EMPTY,
  ).pipe(
    filter(
      (event): event is ExtMatrixEvent =>
        event.getType() === 'm.room.message' &&
        event.getSender() === sender &&
        (event as ExtMatrixEvent).getContent()?.msgtype === 'm.notice',
    ),
    mergeMap((event) => {
      try {
        return of(decode(rtcCodecs[type], jsonParse(event.getContent()?.body)));
      } catch (e) {}
      return EMPTY;
    }),
  );
}

type RtcConnPair = readonly [RTCPeerConnection, RTCDataChannel];

// setup candidates$ handlers
function handleCandidates$(
  connection: RTCPeerConnection,
  matrix: MatrixClient,
  start$: Observable<null>,
  { callId, peerId, peerAddress }: CallInfo,
  deps: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
) {
  const { log, config$ } = deps;
  return config$.pipe(
    first(),
    mergeMap((config) =>
      merge(
        // when seeing an icecandidate, send it to peer
        fromEvent<RTCPeerConnectionIceEvent>(connection, 'icecandidate').pipe(
          pluck('candidate'),
          delayWhen(() => start$),
          takeWhile(isntNil),
          bufferTime(10),
          filter((candidates) => candidates.length > 0),
          tap((e) => log.debug('RTC: got candidates', callId, e)),
          mergeMap((candidates) => {
            const body: t.TypeOf<typeof RtcCandidates> = {
              type: RtcEventType.candidates,
              candidates,
              call_id: callId,
            };
            return waitMemberAndSend$(
              peerAddress,
              matrix,
              'm.room.message',
              { msgtype: 'm.notice', body: jsonStringify(body) },
              deps,
            );
          }),
        ),
        // when receiving candidates from peer, add it locally
        matrixWebrtcEvents$(matrix, RtcEventType.candidates, peerId, config).pipe(
          tap((e) => log.debug('RTC: received candidates', callId, e.candidates)),
          mergeMap((event) => from((event.candidates ?? []) as RTCIceCandidateInit[])),
          mergeMap((candidate) =>
            defer(() => connection.addIceCandidate(candidate)).pipe(
              catchError((err) => {
                log.warn(
                  'RTC: error setting candidate, ignoring',
                  callId,
                  connection.connectionState,
                  candidate,
                  err,
                );
                return EMPTY;
              }),
            ),
          ),
        ),
      ),
    ),
    ignoreElements(),
  );
}

// setup RTC data channel for caller
function setupCallerDataChannel$(
  matrix: MatrixClient,
  start$: Subject<null>,
  { callId, peerId, peerAddress }: CallInfo,
  config: RaidenConfig,
  deps: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
): Observable<RtcConnPair> {
  return defer(() => getMatrixIceServers(matrix)).pipe(
    mergeMap((matrixTurnServers) => {
      const connection = new RTCPeerConnection({
        iceServers: [...matrixTurnServers, ...config.fallbackIceServers],
      });
      // we relay on retries, no need to enforce ordered
      const dataChannel = connection.createDataChannel(callId, { ordered: false });
      return merge(
        // despite 'never' emitting, candidates$ have side-effects while/when subscribed
        handleCandidates$(connection, matrix, start$, { callId, peerId, peerAddress }, deps),
        defer(async () => connection.createOffer()).pipe(
          mergeMap(async (offer) => {
            await connection.setLocalDescription(offer);
            return offer;
          }),
          mergeMap((offer) => {
            const body: t.TypeOf<typeof RtcOffer> = {
              type: offer.type as RtcEventType.offer,
              sdp: offer.sdp!,
              call_id: callId,
            };
            return merge(
              // wait for answer
              matrixWebrtcEvents$(matrix, RtcEventType.answer, peerId, config),
              // send invite with offer
              waitMemberAndSend$(
                peerAddress,
                matrix,
                'm.room.message',
                { msgtype: 'm.notice', body: jsonStringify(body) },
                deps,
              ).pipe(
                tap((e) => deps.log.debug('RTC: sent invite', callId, e)),
                ignoreElements(),
              ),
            );
          }),
          take(1),
          tap(({ call_id: peerCallId }) => {
            deps.log.info('RTC: got answer', callId);
            if (peerCallId !== callId)
              deps.log.warn('RTC: callId mismatch, continuing', { callId, peerCallId });
          }),
          mergeMap(async (event) => connection.setRemoteDescription(event)),
          tap(() => {
            start$.next(null);
            start$.complete();
          }),
          ignoreElements(),
        ),
        of([connection, dataChannel] as const), // output created channel
      );
    }),
  );
}

// setup RTC data channel for callee
function setupCalleeDataChannel$(
  matrix: MatrixClient,
  start$: Subject<null>,
  { callId, peerId, peerAddress }: CallInfo,
  config: RaidenConfig,
  deps: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
): Observable<RtcConnPair> {
  return matrixWebrtcEvents$(matrix, RtcEventType.offer, peerId, config).pipe(
    tap(() => deps.log.info('RTC: got invite', callId)),
    mergeMap((event) =>
      from(getMatrixIceServers(matrix)).pipe(map((serv) => [event, serv] as const)),
    ),
    mergeMap(([event, matrixTurnServers]) => {
      if (event.call_id !== callId)
        deps.log.warn('RTC: callId mismatch, continuing', { callId, peerCallId: event.call_id });
      // create connection only upon invite/offer
      const connection = new RTCPeerConnection({
        iceServers: [...matrixTurnServers, ...config.fallbackIceServers],
      });
      return merge(
        // despite 'never' emitting, candidates$ have side-effects while/when subscribed
        handleCandidates$(connection, matrix, start$, { callId, peerId, peerAddress }, deps),
        defer(async () => connection.setRemoteDescription(event)).pipe(
          mergeMap(async () => connection.createAnswer()),
          mergeMap(async (answer) => {
            await connection.setLocalDescription(answer);
            return answer;
          }),
          mergeMap((answer) => {
            const body: t.TypeOf<typeof RtcAnswer> = {
              type: answer.type as RtcEventType.answer,
              sdp: answer.sdp!,
              call_id: callId,
            };
            // send answer
            return waitMemberAndSend$(
              peerAddress,
              matrix,
              'm.room.message',
              { msgtype: 'm.notice', body: jsonStringify(body) },
              deps,
            );
          }),
          tap((e) => {
            deps.log.debug('RTC: sent answer', callId, e);
            start$.next(null);
            start$.complete();
          }),
          ignoreElements(),
        ),
        fromEvent<RTCDataChannelEvent>(connection, 'datachannel').pipe(
          map(({ channel }) => [connection, channel] as const),
        ),
      );
    }),
    take(1),
  );
}

const hangUpError = 'RTC: peer hung up';
const closedError = 'RTC: dataChannel closed';
const pingMsg = 'ping';
const failedConnectionStates = ['failed', 'closed', 'disconnected'];

// setup listeners & events for a data channel, when it gets opened, and teardown when closed
function listenDataChannel(
  openTimeout: number,
  { callId, peerId, peerAddress }: CallInfo,
  { log }: Pick<RaidenEpicDeps, 'log'>,
): OperatorFunction<RtcConnPair, rtcChannel | messageReceived> {
  return (pair$) =>
    pair$.pipe(
      mergeMap(([connection, dataChannel]) =>
        merge(
          fromEvent<Event>(connection, 'connectionstatechange').pipe(
            startWith(null),
            mergeMap(() =>
              failedConnectionStates.includes(connection.connectionState)
                ? throwError(new Error('RTC: connection failed'))
                : EMPTY,
            ),
          ),
          fromEvent<Event>(dataChannel, 'close').pipe(
            mergeMapTo(throwError(new Error(closedError))),
          ),
          fromEvent<RTCErrorEvent>(dataChannel, 'error').pipe(
            mergeMap((ev) => throwError(ev.error)),
          ),
          fromEvent<Event>(dataChannel, 'open').pipe(
            tap(() => {
              log.info('RTC: dataChannel open', callId);
              // when connected, sends a first message
              dataChannel.send(pingMsg);
            }),
            timeoutFirst(openTimeout),
            // output rtcChannel action with defined channel instance to have it set in latest$
            // on (and only on) first received message; if no message is received, it'll
            // timeout and retry channel
            mapTo(rtcChannel(dataChannel, { address: peerAddress })),
          ),
          // 'race+throwError' is like timeout operator, but applies only once
          // i.e. times out to retry whole connection if no first message is received on time;
          // emits rtcChannel action on first message, instead of on 'open' event
          fromEvent<MessageEvent>(dataChannel, 'message').pipe(
            observeOn(asapScheduler),
            tap((e) => log.debug('RTC: dataChannel message', callId, e)),
            pluck('data'),
            filter((d: unknown): d is string => typeof d === 'string'),
            filter((line) => line !== pingMsg), // ignore pingMsg, used only to succeed rtcChannel
            map((line) =>
              messageReceived(
                {
                  text: line,
                  message: parseMessage(line, peerAddress, { log }),
                  ts: Date.now(),
                  userId: peerId,
                },
                { address: peerAddress },
              ),
            ),
          ),
        ).pipe(
          finalize(() => {
            dataChannel.close();
            // FIXME: https://github.com/node-webrtc/node-webrtc/issues/636
            // connection.close();
          }),
        ),
      ),
    );
}

function makeStopSubject$(
  { callId, peerAddress }: CallInfo,
  matrix: MatrixClient,
  { httpTimeout }: Pick<RaidenConfig, 'httpTimeout'>,
  deps: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
) {
  const stop$ = new AsyncSubject<boolean>();
  stop$
    .pipe(
      filter((errored) => errored),
      mergeMap(() => {
        const body: t.TypeOf<typeof RtcHangup> = {
          type: RtcEventType.hangup,
          call_id: callId,
        };
        return waitMemberAndSend$(
          peerAddress,
          matrix,
          'm.room.message',
          { msgtype: 'm.notice', body: jsonStringify(body) },
          deps,
        ).pipe(takeUntil(timer(httpTimeout / 10)));
      }),
      // take until while$ didn't complate
      takeUntil(deps.latest$.pipe(ignoreElements(), endWith(null))),
    )
    .subscribe(); // when stopping, if not shutting down, send hangup
  return stop$;
}

function makeCallId(addresses: [Address, Address]) {
  return addresses.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join('|');
}

// handles presence changes for a single peer address (grouped)
function handlePresenceChange$(
  action: matrixPresence.success,
  matrix: MatrixClient,
  config: RaidenConfig,
  deps: RaidenEpicDeps,
): Observable<rtcChannel | messageReceived> {
  // if peer goes offline in Matrix, reset dataChannel & unsubscribe defer to close dataChannel
  if (!action.payload.available) return of(rtcChannel(undefined, action.meta));

  const { log, address, latest$, config$ } = deps;
  const callId = makeCallId([address, action.meta.address]);
  const isCaller = callId.startsWith(address);
  // since the lower and upper limits for timeouts are relatively closer, we reduce the
  // multiplier to give more iterations before topping
  const timeoutGen = exponentialBackoff(config.httpTimeout, 2 * config.httpTimeout, 1.2);

  return defer(() => {
    const info: CallInfo = {
      callId,
      peerId: action.payload.userId,
      peerAddress: action.meta.address,
    };

    // start$ indicates invite/offer/answer cycle completed, and candidates can be exchanged
    const start$ = new AsyncSubject<null>();
    // stop$ indicates dataChannel closed (maybe by peer), and teardown should take place
    const stop$ = makeStopSubject$(info, matrix, config, deps);

    let dataChannel$;
    if (isCaller) dataChannel$ = setupCallerDataChannel$(matrix, start$, info, config, deps);
    else dataChannel$ = setupCalleeDataChannel$(matrix, start$, info, config, deps);

    const { value: timeoutValue } = timeoutGen.next();
    if (!timeoutValue) return EMPTY; // shouldn't happen with exponentialBackoff

    // listenDataChannel$ needs channel$:Observable<[RTCDataChannel]>, but we must include/
    // merge setup and monitoring Observable<never>'s to get things moving on subscription
    return merge(
      dataChannel$,
      // throws and restart if peer hangs up
      matrixWebrtcEvents$(matrix, RtcEventType.hangup, info.peerId, config).pipe(
        // no need for specific error since this is just logged and ignored
        mergeMapTo(throwError(new Error(hangUpError))),
      ),
    ).pipe(
      listenDataChannel(timeoutValue, info, deps),
      takeUntil(stop$),
      catchError((err) => {
        // emit false for these errors, to prevent delayed hangup event to be sent
        stop$.next(![hangUpError, closedError].includes(err?.message));
        stop$.complete();
        log.info("Couldn't set up WebRTC dataChannel, retrying", callId, err?.message ?? err);
        return EMPTY;
      }),
      // if it ends by takeUntil or catchError, output rtcChannel to reset latest$ mapping
      endWith(rtcChannel(undefined, { address: action.meta.address })),
    );
  }).pipe(
    // if it disconnects for any reason, but partner is still online,
    // try to reconnect by repeating from 'defer'
    repeatWhen((completed$) =>
      completed$.pipe(
        withLatestFrom(latest$, config$),
        mergeMap(
          ([, { presences }, { pollingInterval }]) =>
            !presences[action.meta.address]?.payload.available
              ? EMPTY
              : isCaller
              ? timer(pollingInterval) // caller waits some time to retry
              : of(null), // callee restart listening immediately,
        ),
      ),
    ),
  );
}

/**
 * Epic to handle presence updates and try to connect a webRTC channel with compatible peers
 *
 * @param action$ - Observable of RaidenActions
 * @param deps - Epics dependencies
 * @returns Observable of rtcChannel | messageReceived actions
 */
export function rtcConnectEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<rtcChannel | messageReceived> {
  return action$.pipe(
    filter(matrixPresence.success.is),
    groupBy((action) => action.meta.address),
    mergeMap((grouped$) => {
      const { matrix$, config$ } = deps;
      return grouped$.pipe(
        distinctUntilChanged(
          (a, b) =>
            a.payload.userId === b.payload.userId &&
            a.payload.available === b.payload.available &&
            !!getCap(a.payload.caps, Capabilities.WEBRTC) ===
              !!getCap(b.payload.caps, Capabilities.WEBRTC),
        ),
        withLatestFrom(matrix$, config$),
        filter(
          ([action, , { caps }]) =>
            !!getCap(action.payload.caps, Capabilities.WEBRTC) &&
            !!getCap(caps, Capabilities.WEBRTC),
        ),
        switchMap(([action, matrix, config]) =>
          handlePresenceChange$(action, matrix, config, deps),
        ),
      );
    }),
  );
}
