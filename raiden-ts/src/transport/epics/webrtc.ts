/* eslint-disable @typescript-eslint/camelcase */
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
  mapTo,
  finalize,
  timeout,
  pluck,
  repeatWhen,
  delayWhen,
  takeWhile,
  bufferTime,
  endWith,
  mergeMapTo,
} from 'rxjs/operators';

import { MatrixClient, MatrixEvent, EventType } from 'matrix-js-sdk';

import { Capabilities } from '../../constants';
import { Address, isntNil } from '../../utils/types';
import { RaidenEpicDeps } from '../../types';
import { RaidenAction, raidenShutdown } from '../../actions';
import { RaidenConfig } from '../../config';
import { messageReceived } from '../../messages/actions';
import { RaidenState } from '../../state';
import { matrixPresence, rtcChannel } from '../actions';
import { waitMemberAndSend$, parseMessage } from './helpers';

type CallInfo = { callId: string; peerId: string; peerAddress: Address };

// fetches and caches matrix set turnServer
const _matrixIceServersCache = new WeakMap<MatrixClient, [number, RTCIceServer[]]>();
async function getMatrixIceServers(matrix: MatrixClient): Promise<RTCIceServer[]> {
  const cached = _matrixIceServersCache.get(matrix);
  if (cached && Date.now() < cached[0]) return cached[1];
  const fetched = ((await matrix.turnServer()) as unknown) as
    | {
        uris: string | string[];
        ttl: number;
        username: string;
        password: string;
      }
    | {}
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

// creates a filter function which filters valid MatrixEvents
function filterMatrixVoipEvents<
  T extends 'm.call.invite' | 'm.call.answer' | 'm.call.candidates' | 'm.call.hangup'
>(type: T, sender: string, callId: string, httpTimeout?: number) {
  type ContentKey = T extends 'm.call.invite'
    ? 'offer'
    : T extends 'm.call.answer'
    ? 'answer'
    : T extends 'm.call.candidates'
    ? 'candidates'
    : never;
  const contentKey = (type === 'm.call.invite'
    ? 'offer'
    : type === 'm.call.answer'
    ? 'answer'
    : type === 'm.call.candidates'
    ? 'candidates'
    : undefined) as ContentKey | undefined;
  return (
    // FIXME: remove any when MatrixEvent type exposes getAge & getContent methods
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any,
  ): event is MatrixEvent & {
    getType: () => T;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getContent: () => { call_id: string } & { [K in ContentKey]: any };
  } =>
    event.getType() === type &&
    event.getSender() === sender &&
    event.getContent()?.call_id === callId &&
    (!httpTimeout || event.getAge() <= (event.getContent()?.lifetime ?? httpTimeout)) &&
    (!contentKey || !!event.getContent()?.[contentKey]);
}

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
      mergeMap((candidates) =>
        waitMemberAndSend$(
          peerAddress,
          matrix,
          'm.call.candidates' as EventType,
          { call_id: callId, version: 0, candidates },
          { log, latest$, config$ },
        ),
      ),
    ),
    // when receiving candidates from peer, add it locally
    fromEvent<MatrixEvent>(matrix, 'event').pipe(
      filter(filterMatrixVoipEvents('m.call.candidates', peerId, callId)),
      tap((e) => log.debug('RTC: received candidates', callId, e.getContent().candidates)),
      mergeMap((event) => from<RTCIceCandidateInit[]>(event.getContent().candidates ?? [])),
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
  { httpTimeout, fallbackIceServers }: RaidenConfig,
  deps: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
): Observable<RTCDataChannel> {
  const { callId, peerId, peerAddress } = info;
  const { log, latest$, config$ } = deps;

  return from(getMatrixIceServers(matrix)).pipe(
    mergeMap((matrixTurnServers) => {
      const connection = new RTCPeerConnection({
        iceServers: [...matrixTurnServers, ...fallbackIceServers],
      });
      // we relay on retries, no need to enforce ordered
      const dataChannel = connection.createDataChannel(callId, { ordered: false });
      return merge(
        // despite 'never' emitting, candidates$ have side-effects while/when subscribed
        handleCandidates$(connection, matrix, start$, info, deps),
        defer(() => connection.createOffer()).pipe(
          mergeMap((offer) => {
            connection.setLocalDescription(offer);
            const content = {
              call_id: callId,
              lifetime: httpTimeout,
              version: 0,
              offer,
            };
            return merge(
              // wait for answer
              fromEvent<MatrixEvent>(matrix, 'event').pipe(
                filter(filterMatrixVoipEvents('m.call.answer', peerId, callId, httpTimeout)),
              ),
              // send invite with offer
              waitMemberAndSend$(peerAddress, matrix, 'm.call.invite' as EventType, content, {
                log,
                latest$,
                config$,
              }).pipe(
                tap((e) => log.debug('RTC: sent invite', callId, e)),
                ignoreElements(),
              ),
            );
          }),
          take(1),
          tap(() => log.info('RTC: got answer', callId)),
          map((event) => {
            connection.setRemoteDescription(new RTCSessionDescription(event.getContent().answer));
            start$.next(null);
            start$.complete();
          }),
          ignoreElements(),
        ),
        of(dataChannel), // output created channel
      );
    }),
  );
}

// setup RTC data channel for callee
function setupCalleeDataChannel$(
  matrix: MatrixClient,
  start$: Subject<null>,
  info: CallInfo,
  { httpTimeout }: RaidenConfig,
  deps: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
): Observable<RTCDataChannel> {
  const { callId, peerId, peerAddress } = info;
  const { log, latest$, config$ } = deps;
  return fromEvent<MatrixEvent>(matrix, 'event').pipe(
    filter(filterMatrixVoipEvents('m.call.invite', peerId, callId, httpTimeout)),
    tap(() => log.info('RTC: got invite', callId)),
    mergeMap((event) =>
      from(getMatrixIceServers(matrix)).pipe(map((serv) => [event, serv] as const)),
    ),
    withLatestFrom(config$),
    mergeMap(([[event, matrixTurnServers], { fallbackIceServers }]) => {
      // create connection only upon invite/offer
      const connection = new RTCPeerConnection({
        iceServers: [...matrixTurnServers, ...fallbackIceServers],
      });
      connection.setRemoteDescription(new RTCSessionDescription(event.getContent().offer));
      return merge(
        // despite 'never' emitting, candidates$ have side-effects while/when subscribed
        handleCandidates$(connection, matrix, start$, info, deps),
        defer(() => connection.createAnswer()).pipe(
          mergeMap((answer) => {
            connection.setLocalDescription(answer);
            const content = {
              call_id: callId,
              lifetime: httpTimeout,
              version: 0,
              answer,
            };
            // send answer
            return waitMemberAndSend$(peerAddress, matrix, 'm.call.answer' as EventType, content, {
              log,
              latest$,
              config$,
            });
          }),
          tap((e) => {
            log.debug('RTC: sent answer', callId, e);
            start$.next(null);
            start$.complete();
          }),
          ignoreElements(),
        ),
        fromEvent<RTCDataChannelEvent>(connection, 'datachannel').pipe(pluck('channel')),
      );
    }),
    take(1),
  );
}

// setup listeners & events for a data channel, when it gets opened, and teardown when closed
function listenDataChannel$(
  stop$: Subject<null>,
  { callId, peerId, peerAddress }: CallInfo,
  { httpTimeout }: RaidenConfig,
  { log }: Pick<RaidenEpicDeps, 'log'>,
): OperatorFunction<RTCDataChannel, rtcChannel | messageReceived> {
  return (dataChannel$) =>
    dataChannel$.pipe(
      mergeMap((dataChannel) =>
        merge(
          fromEvent<Event>(dataChannel, 'close').pipe(
            tap(() => {
              log.info('RTC: dataChannel close', callId);
              stop$.next(null);
              stop$.complete();
            }),
            ignoreElements(),
          ),
          fromEvent<RTCErrorEvent>(dataChannel, 'error').pipe(
            mergeMap((ev) => throwError(ev.error)),
          ),
          fromEvent<Event>(dataChannel, 'open').pipe(
            take(1),
            // this timeout ensures the whole dataChannel$ observable throws if it can't be set up,
            // so it can be retried/repeated/restarted.
            // notice it only starts after dataChannel$ emits, i.e. on subscription for caller (as
            // it createDataChannel object, then responsible for hanging up call and retrying),
            // and after 'datachannel' event for callee (passive listener)
            timeout(httpTimeout / 3),
            tap(() => log.info('RTC: dataChannel open', callId)),
            // output rtcChannel action with defined channel instance to have it set in latest$
            mapTo(rtcChannel(dataChannel, { address: peerAddress })),
          ),
          fromEvent<MessageEvent>(dataChannel, 'message').pipe(
            tap((e) => log.debug('RTC: dataChannel message', callId, e)),
            pluck('data'),
            filter((d: unknown): d is string => typeof d === 'string'),
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
        ).pipe(finalize(() => dataChannel.close())),
      ),
      takeUntil(stop$),
      catchError((err) => {
        stop$.next(null);
        stop$.complete();
        log.info("Couldn't set up WebRTC dataChannel, retrying", callId, err?.message ?? err);
        return EMPTY;
      }),
      // if it ends by takeUntil or catchError, output rtcChannel to reset latest$ mapping
      endWith(rtcChannel(undefined, { address: peerAddress })),
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
        a.payload.userId === b.payload.userId && a.payload.available === b.payload.available,
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
      return defer(() => {
        const info: CallInfo = {
          callId,
          peerId: action.payload.userId,
          peerAddress: action.meta.address,
        };

        // start$ indicates invite/offer/answer cycle completed, and candidates can be exchanged
        const start$ = new AsyncSubject<null>();
        // stop$ indicates dataChannel closed (maybe by peer), and teardown should take place
        const stop$ = new AsyncSubject<null>();

        let dataChannel$: Observable<RTCDataChannel>;
        if (isCaller) {
          // caller
          dataChannel$ = setupCallerDataChannel$(matrix, start$, info, config, deps);
        } else {
          // callee
          dataChannel$ = setupCalleeDataChannel$(matrix, start$, info, config, deps);
        }

        stop$
          .pipe(
            mergeMap(() =>
              waitMemberAndSend$(
                action.meta.address,
                matrix,
                'm.call.hangup' as EventType,
                { call_id: callId, version: 0 },
                { log, latest$, config$ },
              ).pipe(takeUntil(timer(config.httpTimeout / 10))),
            ),
            takeUntil(action$.pipe(filter(raidenShutdown.is))),
          )
          .subscribe(); // when stopping, if not shutting down, send hangup

        // listenDataChannel$ needs channel$:Observable<RTCDataChannel>, but we must include/merge
        // setup and monitoring Observable<never>'s to get things moving on subscription
        return merge(
          dataChannel$,
          // throws nad restart if peer hangs up
          fromEvent<MatrixEvent>(matrix, 'event').pipe(
            filter(filterMatrixVoipEvents('m.call.hangup', info.peerId, callId)),
            // no need for specific error since this is just logged and ignored in listenDataChannel$
            mergeMapTo(throwError(new Error('RTC: peer hung up'))),
          ),
        ).pipe(listenDataChannel$(stop$, info, config, deps));
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
