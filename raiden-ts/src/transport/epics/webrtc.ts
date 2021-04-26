import * as t from 'io-ts';
import constant from 'lodash/constant';
import type { MatrixClient } from 'matrix-js-sdk';
import type { Observable, OperatorFunction } from 'rxjs';
import {
  asapScheduler,
  AsyncSubject,
  defer,
  EMPTY,
  from,
  fromEvent,
  merge,
  of,
  throwError,
  timer,
} from 'rxjs';
import {
  bufferTime,
  catchError,
  delayWhen,
  distinct,
  endWith,
  filter,
  finalize,
  ignoreElements,
  map,
  mapTo,
  mergeMap,
  mergeMapTo,
  observeOn,
  pluck,
  repeatWhen,
  share,
  startWith,
  switchMap,
  take,
  takeUntil,
  takeWhile,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { channelMonitored } from '../../channels/actions';
import type { RaidenConfig } from '../../config';
import { Capabilities } from '../../constants';
import { messageReceived, messageSend } from '../../messages/actions';
import type { RaidenState } from '../../state';
import { transferSigned } from '../../transfers/actions';
import { dispatchAndWait$, exponentialBackoff } from '../../transfers/epics/utils';
import { Direction } from '../../transfers/state';
import { makeMessageId } from '../../transfers/utils';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf, isResponseOf } from '../../utils/actions';
import { jsonParse, jsonStringify } from '../../utils/data';
import { matchError } from '../../utils/error';
import { completeWith, dispatchRequestAndGetResponse, takeIf, timeoutFirst } from '../../utils/rx';
import type { Address } from '../../utils/types';
import { decode, isntNil } from '../../utils/types';
import { matrixPresence, rtcChannel } from '../actions';
import { getCap, getSortedAddresses } from '../utils';
import { parseMessage } from './helpers';

interface CallInfo {
  callId: string;
  readonly peerId: string;
  readonly peerAddress: Address;
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

// returns a stream of filtered, valid MatrixEvents
function matrixWebrtcEvents$<T extends RtcEventType>(
  action$: Observable<RaidenAction>,
  type: T,
  sender: Address,
  callId: string | undefined,
  { log }: Partial<Pick<RaidenEpicDeps, 'log'>> = {},
) {
  return action$.pipe(
    filter(messageReceived.is),
    filter(
      (action) => action.meta.address === sender && action.payload.msgtype === rtcMatrixMsgType,
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

type RtcConnPair = readonly [RTCPeerConnection, RTCDataChannel];
function isRtcConnPair(value: unknown): value is RtcConnPair {
  return Array.isArray(value) && value.length === 2 && value[1]?.readyState;
}

// setup candidates$ handlers
function handleCandidates$(
  connection: RTCPeerConnection,
  action$: Observable<RaidenAction>,
  info: CallInfo,
  { log }: Pick<RaidenEpicDeps, 'log'>,
) {
  return merge(
    // when receiving candidates from peer, add it locally
    matrixWebrtcEvents$(action$, RtcEventType.candidates, info.peerAddress, info.callId, {
      log,
    }).pipe(
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
          { message: jsonStringify(body), msgtype: rtcMatrixMsgType },
          { address: info.peerAddress, msgId: makeMessageId().toString() },
        );
      }),
    ),
  );
}

// setup RTC data channel for caller
function setupCallerDataChannel$(
  action$: Observable<RaidenAction>,
  info: CallInfo,
  deps: Pick<RaidenEpicDeps, 'matrix$' | 'log' | 'latest$' | 'config$'>,
): Observable<RtcConnPair | messageSend.request> {
  const { peerAddress } = info;
  return deps.matrix$.pipe(
    mergeMap((matrix) => getMatrixIceServers(matrix)),
    withLatestFrom(deps.config$),
    mergeMap(([matrixTurnServers, { fallbackIceServers }]) => {
      const connection = new RTCPeerConnection({
        iceServers: [...matrixTurnServers, ...fallbackIceServers],
      });
      // start$ indicates invite/offer/answer cycle completed, and candidates can be exchanged
      const start$ = new AsyncSubject<true>();
      // we relay on retries, no need to enforce ordered
      const dataChannel = connection.createDataChannel(info.callId, { ordered: false });
      return merge(
        handleCandidates$(connection, action$, info, deps).pipe(delayWhen(constant(start$))),
        defer(async () => connection.createOffer()).pipe(
          mergeMap(async (offer) => {
            await connection.setLocalDescription(offer);
            return offer;
          }),
          mergeMap((offer) => {
            const body: t.TypeOf<typeof RtcOffer> = {
              type: offer.type as RtcEventType.offer,
              sdp: offer.sdp!,
              call_id: info.callId,
            };
            const meta = { address: peerAddress, msgId: makeMessageId().toString() };
            const request = messageSend.request(
              { message: jsonStringify(body), msgtype: rtcMatrixMsgType },
              meta,
            );
            let emitted = 0;
            return merge(
              // wait for answer
              matrixWebrtcEvents$(
                action$,
                RtcEventType.answer,
                peerAddress,
                info.callId,
                deps,
              ).pipe(
                take(1),
                mergeMap(async (event) => {
                  deps.log.info('RTC: got answer', event.call_id);
                  await connection.setRemoteDescription(event);
                  // output created channel when the offer has been sent
                  return [connection, dataChannel] as const;
                }),
                finalize(() => {
                  start$.next(true);
                  start$.complete();
                }),
              ),
              // send invite with offer, complete when response goes through
              dispatchAndWait$(action$, request, isResponseOf(messageSend, meta)).pipe(
                endWith([connection, dataChannel] as const),
              ),
              // merge emits connection pair on either (or both) request sent or answer received;
              // this filter ensures connection pair is emitted only once, while keeping observable
              // from completing until all merged observables complete
            ).pipe(
              filter((value) => (isRtcConnPair(value) ? !emitted++ : true)),
              finalize(() => (!emitted ? connection.close() : null)),
            );
          }),
        ),
      );
    }),
  );
}

// setup RTC data channel for callee
function setupCalleeDataChannel$(
  action$: Observable<RaidenAction>,
  info: CallInfo,
  deps: Pick<RaidenEpicDeps, 'matrix$' | 'log' | 'latest$' | 'config$'>,
): Observable<RtcConnPair | messageSend.request> {
  const { peerAddress } = info;
  return matrixWebrtcEvents$(action$, RtcEventType.offer, peerAddress, undefined, deps).pipe(
    tap((event) => deps.log.info('RTC: got invite', event.call_id)),
    mergeMap((event) =>
      deps.matrix$.pipe(
        mergeMap((matrix) => getMatrixIceServers(matrix).then((serv) => [event, serv] as const)),
      ),
    ),
    withLatestFrom(deps.config$),
    switchMap(([[event, matrixTurnServers], { fallbackIceServers }]) => {
      if (event.call_id !== info.callId) {
        deps.log.info('RTC: setting callId from caller', { info, event });
        if (event.call_id) info.callId = event.call_id; // set callId as per caller's
      }
      // start$ indicates invite/offer/answer cycle completed, and candidates can be exchanged
      const start$ = new AsyncSubject<true>();
      // create connection only upon invite/offer
      const connection = new RTCPeerConnection({
        iceServers: [...matrixTurnServers, ...fallbackIceServers],
      });
      let close = true;
      return merge(
        handleCandidates$(connection, action$, info, deps).pipe(delayWhen(constant(start$))),
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
              call_id: info.callId,
            };
            const request = messageSend.request(
              { message: jsonStringify(body), msgtype: rtcMatrixMsgType },
              { address: peerAddress, msgId: makeMessageId().toString() },
            );
            // send answer, complete when response goes through
            return dispatchAndWait$(action$, request, isResponseOf(messageSend, request.meta));
          }),
          finalize(() => (start$.next(true), start$.complete())),
        ),
        fromEvent<RTCDataChannelEvent>(connection, 'datachannel').pipe(
          map(({ channel }) => [connection, channel] as const),
          take(1),
          tap(() => (close = false)),
          // if switchMap unsubscribes before datachannel got emitted, release connection
          finalize(() => (close ? connection.close() : null)),
        ),
      );
    }),
  );
}

const hangUpError = 'peer hung up';
const closedError = 'channel closed';
const pingMsg = 'ping';
const failedConnectionStates = ['failed', 'closed', 'disconnected'];

// setup listeners & events for a data channel, when it gets opened, and teardown when closed
function listenDataChannel(
  openTimeout: number,
  { peerId, peerAddress }: CallInfo,
  { log }: Pick<RaidenEpicDeps, 'log'>,
): OperatorFunction<
  messageSend.request | RtcConnPair,
  messageSend.request | rtcChannel | messageReceived
> {
  return (source$) => {
    const open$ = new AsyncSubject<true>();
    // input$ mirrors source$, but completes when a dataChannel gets opened
    const input$ = source$.pipe(takeUntil(open$), share());

    const sendReq$ = input$.pipe(filter(messageSend.request.is));
    const handleChannel$ = input$.pipe(filter(isRtcConnPair)).pipe(
      switchMap(([connection, dataChannel]) =>
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
              log.info('RTC: dataChannel open', dataChannel.label);
              // when connected, sends a first message
              dataChannel.send(pingMsg);
            }),
            timeoutFirst(openTimeout),
            // output rtcChannel action with defined channel instance to have it set in latest$
            // on (and only on) first received message; if no message is received, it'll
            // timeout and retry channel
            tap(() => {
              open$.next(true);
              open$.complete();
            }),
            mapTo(rtcChannel(dataChannel, { address: peerAddress })),
          ),
          // 'race+throwError' is like timeout operator, but applies only once
          // i.e. times out to retry whole connection if no first message is received on time;
          // emits rtcChannel action on first message, instead of on 'open' event
          fromEvent<MessageEvent>(dataChannel, 'message').pipe(
            observeOn(asapScheduler),
            tap((e) => log.debug('RTC: dataChannel message', dataChannel.label, e)),
            pluck('data'),
            filter((d: unknown): d is string => typeof d === 'string'),
            filter((line) => line !== pingMsg), // ignore pingMsg, used only to succeed rtcChannel
            mergeMap((lines) => from(lines.split('\n'))),
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
        ).pipe(finalize(() => connection.close())),
      ),
    );
    return merge(sendReq$, handleChannel$);
  };
}

function makeCallId(our: Address, partner: Address) {
  const addresses = getSortedAddresses(our, partner);
  const isCaller = addresses[0] === our;
  let callId = addresses.join('|');
  if (isCaller) callId += `|${Date.now()}`;
  return callId;
}

// handles presence changes for a single peer address (grouped)
function handlePresenceChange$(
  action: matrixPresence.success,
  action$: Observable<RaidenAction>,
  { httpTimeout, pollingInterval }: RaidenConfig,
  deps: RaidenEpicDeps,
): Observable<rtcChannel | messageSend.request | messageReceived> {
  // if peer goes offline in Matrix, reset dataChannel & unsubscribe defer to close dataChannel
  if (!getCap(action.payload.caps, Capabilities.WEBRTC))
    return of(rtcChannel(undefined, action.meta));

  const { log, address } = deps;
  const isCaller = getSortedAddresses(address, action.meta.address)[0] === address;
  // since the lower and upper limits for timeouts are relatively closer, we reduce the
  // multiplier to give more iterations before topping
  const timeoutGen = exponentialBackoff(httpTimeout, 2 * httpTimeout, 1.2);

  return defer(() => {
    const callId = makeCallId(address, action.meta.address);
    const info: CallInfo = {
      callId, // callee is expected to update its callId when receiving from caller
      peerId: action.payload.userId,
      peerAddress: action.meta.address,
    };

    // stop$ indicates dataChannel closed (maybe by peer), and teardown should take place
    const stop$ = new AsyncSubject<boolean>();

    let dataChannel$;
    if (isCaller) dataChannel$ = setupCallerDataChannel$(action$, info, deps);
    else dataChannel$ = setupCalleeDataChannel$(action$, info, deps);

    const { value: timeoutValue } = timeoutGen.next();
    if (!timeoutValue) return EMPTY; // shouldn't happen with exponentialBackoff

    // listenDataChannel$ needs channel$:Observable<[RTCDataChannel]>, but we must include/
    // merge setup and monitoring Observable<never>'s to get things moving on subscription
    return merge(
      merge(
        dataChannel$,
        // throws and restart if peer hangs up
        matrixWebrtcEvents$(action$, RtcEventType.hangup, info.peerAddress, info.callId, {
          log,
        }).pipe(
          // no need for specific error since this is just logged and ignored
          mergeMapTo(throwError(new Error(hangUpError))),
        ),
      ).pipe(
        listenDataChannel(timeoutValue, info, deps),
        takeUntil(stop$),
        catchError((err) => {
          // emit false for these errors, to prevent delayed hangup event to be sent
          stop$.next(!matchError([hangUpError, closedError], err));
          stop$.complete();
          log.info(
            "Couldn't set up WebRTC dataChannel, retrying",
            info.callId,
            err?.message ?? err,
          );
          return EMPTY;
        }),
        // if it ends by takeUntil or catchError, output rtcChannel to reset latest$ mapping
        endWith(rtcChannel(undefined, { address: action.meta.address })),
      ),
      // merge possible hangup on stop$
      stop$.pipe(
        filter((errored) => errored),
        map(() => {
          const body: t.TypeOf<typeof RtcHangup> = {
            type: RtcEventType.hangup,
            call_id: info.callId,
          };
          return messageSend.request(
            { message: jsonStringify(body), msgtype: rtcMatrixMsgType },
            { address: info.peerAddress, msgId: makeMessageId().toString() },
          );
        }),
      ),
    );
  }).pipe(
    // if it disconnects for any reason, try to reconnect by repeating from 'defer';
    // caller waits some time before retrying, caller starts listening immediately
    repeatWhen((completed$) =>
      completed$.pipe(mergeMap(() => (isCaller ? timer(pollingInterval) : of(null)))),
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
): Observable<rtcChannel | messageSend.request | messageReceived | matrixPresence.request> {
  const { config$, address } = deps;
  return action$.pipe(
    // allow RTC connect to neighbors, initiators for received and targets for sent transfers
    filter(isActionOf([transferSigned, channelMonitored])),
    mergeMap(function* (action) {
      if (channelMonitored.is(action)) yield action.meta.partner;
      else if (
        action.meta.direction === Direction.SENT &&
        action.payload.message.initiator === address
      )
        yield action.payload.message.target;
      else if (
        action.meta.direction === Direction.RECEIVED &&
        action.payload.message.target === address
      )
        yield action.payload.message.initiator;
    }),
    distinct(),
    mergeMap((peer) =>
      action$.pipe(
        dispatchRequestAndGetResponse(matrixPresence, (dispatch) =>
          dispatch(matrixPresence.request(undefined, { address: peer })).pipe(
            withLatestFrom(config$),
            switchMap(([presence, config]) =>
              handlePresenceChange$(presence, action$, config, deps),
            ),
            completeWith(action$),
            catchError((err) => {
              deps.log.warn('Error fetching presence for WebRTC', peer, err);
              return EMPTY;
            }),
          ),
        ),
      ),
    ),
    takeIf(config$.pipe(pluck('caps', Capabilities.WEBRTC), completeWith(action$))),
  );
}
