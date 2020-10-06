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
) {
  return merge(
    fromEvent<[MatrixEvent]>(matrix, 'Room.timeline').pipe(pluck(0)),
    fromEvent<MatrixEvent>(matrix, 'toDeviceEvent'),
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
  { log, latest$, config$ }: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
) {
  return merge(
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
          { log, latest$, config$ },
        );
      }),
    ),
    // when receiving candidates from peer, add it locally
    matrixWebrtcEvents$(matrix, RtcEventType.candidates, peerId).pipe(
      tap((e) => log.debug('RTC: received candidates', callId, e.candidates)),
      mergeMap((event) => from((event.candidates ?? []) as RTCIceCandidateInit[])),
      mergeMap((candidate) =>
        defer(() => connection.addIceCandidate(candidate)).pipe(
          catchError((err) => {
            log.error('RTC: error setting candidate, ignoring', err);
            return EMPTY;
          }),
        ),
      ),
    ),
  ).pipe(ignoreElements());
}

// setup RTC data channel for caller
function setupCallerDataChannel$(
  matrix: MatrixClient,
  start$: Subject<null>,
  info: CallInfo,
  { fallbackIceServers }: RaidenConfig,
  deps: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
): Observable<RtcConnPair> {
  const { callId, peerId, peerAddress } = info;
  const { log, latest$, config$ } = deps;

  return defer(() => getMatrixIceServers(matrix)).pipe(
    mergeMap((matrixTurnServers) => {
      const connection = new RTCPeerConnection({
        iceServers: [...matrixTurnServers, ...fallbackIceServers],
      });
      // we relay on retries, no need to enforce ordered
      const dataChannel = connection.createDataChannel(callId, { ordered: false });
      Object.assign(dataChannel, { connection });
      return merge(
        // despite 'never' emitting, candidates$ have side-effects while/when subscribed
        handleCandidates$(connection, matrix, start$, info, deps),
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
              matrixWebrtcEvents$(matrix, RtcEventType.answer, peerId),
              // send invite with offer
              waitMemberAndSend$(
                peerAddress,
                matrix,
                'm.room.message',
                { msgtype: 'm.notice', body: jsonStringify(body) },
                { log, latest$, config$ },
              ).pipe(
                tap((e) => log.debug('RTC: sent invite', callId, e)),
                ignoreElements(),
              ),
            );
          }),
          take(1),
          tap((event) => {
            log.info('RTC: got answer', callId);
            if (event.call_id !== callId)
              log.warn(
                `RTC: callId mismatch, continuing: we="${callId}", them="${event.call_id}"`,
              );
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
  info: CallInfo,
  {}: RaidenConfig,
  deps: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
): Observable<RtcConnPair> {
  const { callId, peerId, peerAddress } = info;
  const { log, latest$, config$ } = deps;
  return matrixWebrtcEvents$(matrix, RtcEventType.offer, peerId).pipe(
    tap(() => log.info('RTC: got invite', callId)),
    mergeMap((event) =>
      from(getMatrixIceServers(matrix)).pipe(map((serv) => [event, serv] as const)),
    ),
    withLatestFrom(config$),
    mergeMap(([[event, matrixTurnServers], { fallbackIceServers }]) => {
      if (event.call_id !== callId)
        log.warn(`RTC: callId mismatch, continuing: we="${callId}", them="${event.call_id}"`);
      // create connection only upon invite/offer
      const connection = new RTCPeerConnection({
        iceServers: [...matrixTurnServers, ...fallbackIceServers],
      });
      return merge(
        // despite 'never' emitting, candidates$ have side-effects while/when subscribed
        handleCandidates$(connection, matrix, start$, info, deps),
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
              { log, latest$, config$ },
            );
          }),
          tap((e) => {
            log.debug('RTC: sent answer', callId, e);
            start$.next(null);
            start$.complete();
          }),
          ignoreElements(),
        ),
        fromEvent<RTCDataChannelEvent>(connection, 'datachannel').pipe(
          pluck('channel'),
          tap((channel) => Object.assign(channel, { connection })),
          map((channel) => [connection, channel] as const),
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
            ignoreElements(),
          ),
          // 'race+throwError' is like timeout operator, but applies only once
          // i.e. times out to retry whole connection if no first message is received on time;
          // emits rtcChannel action on first message, instead of on 'open' event
          fromEvent<MessageEvent>(dataChannel, 'message').pipe(
            timeoutFirst(openTimeout),
            tap((e) => log.debug('RTC: dataChannel message', callId, e)),
            pluck('data'),
            filter((d: unknown): d is string => typeof d === 'string'),
            mergeMap(function* (line, msgCount) {
              // output rtcChannel action with defined channel instance to have it set in latest$
              // on (and only on) first received message; if no message is received, it'll
              // timeout and retry channel
              if (msgCount === 0) yield rtcChannel(dataChannel, { address: peerAddress });
              if (line === pingMsg) return; // ignore pingMsg, used only to succeed rtcChannel
              yield messageReceived(
                {
                  text: line,
                  message: parseMessage(line, peerAddress, { log }),
                  ts: Date.now(),
                  userId: peerId,
                },
                { address: peerAddress },
              );
            }),
          ),
        ).pipe(finalize(() => (dataChannel.close(), connection.close()))),
      ),
    );
}

// handles presence changes for a single peer address (grouped)
function handlePresenceChange$(
  action$: Observable<RaidenAction>,
  presence$: Observable<matrixPresence.success>,
  { log, address, latest$, matrix$, config$ }: RaidenEpicDeps,
) {
  return presence$.pipe(
    distinctUntilChanged(
      (a, b) =>
        a.payload.userId === b.payload.userId &&
        a.payload.available === b.payload.available &&
        a.payload.caps?.[Capabilities.WEBRTC] === b.payload.caps?.[Capabilities.WEBRTC],
    ),
    withLatestFrom(matrix$, config$),
    filter(
      ([action, , { caps }]) =>
        !!action.payload.caps?.[Capabilities.WEBRTC] && !!caps?.[Capabilities.WEBRTC],
    ),
    switchMap(([action, matrix, config]) => {
      // if peer goes offline in Matrix, reset dataChannel & unsubscribe defer to close dataChannel
      if (!action.payload.available) return of(rtcChannel(undefined, action.meta));

      const deps = { log, latest$, config$ };
      const callId = [address, action.meta.address]
        .map((a) => a.toLowerCase())
        .sort((a, b) => a.localeCompare(b))
        .join('|');
      const isCaller = callId.startsWith(address.toLowerCase());
      const timeoutGen = exponentialBackoff(config.pollingInterval, 2 * config.httpTimeout);

      return defer(() => {
        const info: CallInfo = {
          callId,
          peerId: action.payload.userId,
          peerAddress: action.meta.address,
        };

        // start$ indicates invite/offer/answer cycle completed, and candidates can be exchanged
        const start$ = new AsyncSubject<null>();
        // stop$ indicates dataChannel closed (maybe by peer), and teardown should take place
        const stop$ = new AsyncSubject<boolean>();

        let dataChannel$;
        if (isCaller) {
          // caller
          dataChannel$ = setupCallerDataChannel$(matrix, start$, info, config, deps);
        } else {
          // callee
          dataChannel$ = setupCalleeDataChannel$(matrix, start$, info, config, deps);
        }

        stop$
          .pipe(
            filter((errored) => errored),
            mergeMap(() => {
              const body: t.TypeOf<typeof RtcHangup> = {
                type: RtcEventType.hangup,
                call_id: callId,
              };
              return waitMemberAndSend$(
                action.meta.address,
                matrix,
                'm.room.message',
                { msgtype: 'm.notice', body: jsonStringify(body) },
                { log, latest$, config$ },
              ).pipe(takeUntil(timer(config.httpTimeout / 10)));
            }),
            takeUntil(action$.pipe(ignoreElements(), endWith(null))),
          )
          .subscribe(); // when stopping, if not shutting down, send hangup

        const { value: timeoutValue } = timeoutGen.next();
        if (!timeoutValue) return EMPTY; // shouldn't happen with exponentialBackoff

        // listenDataChannel$ needs channel$:Observable<[RTCDataChannel]>, but we must include/
        // merge setup and monitoring Observable<never>'s to get things moving on subscription
        return merge(
          dataChannel$,
          // throws and restart if peer hangs up
          matrixWebrtcEvents$(matrix, RtcEventType.hangup, info.peerId).pipe(
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
              ([, { presences }, { httpTimeout }]) =>
                !presences[action.meta.address]?.payload?.available
                  ? EMPTY
                  : isCaller
                  ? timer(httpTimeout / 10) // caller waits some time to retry
                  : of(null), // callee restart listening immediately,
            ),
          ),
        ),
      );
    }),
  );
}

export const rtcConnectEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<rtcChannel | messageReceived> =>
  action$.pipe(
    filter(matrixPresence.success.is),
    groupBy((action) => action.meta.address),
    mergeMap((grouped$) => handlePresenceChange$(action$, grouped$, deps)),
  );
