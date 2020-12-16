import { Observable, of, fromEvent, combineLatest, EMPTY, defer } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  take,
  switchMap,
  mapTo,
  withLatestFrom,
  delayWhen,
} from 'rxjs/operators';
import { Room, MatrixClient, EventType } from 'matrix-js-sdk';
import curry from 'lodash/curry';
import constant from 'lodash/constant';

import { Capabilities } from '../../constants';
import { intervalFromConfig, RaidenConfig } from '../../config';
import { RaidenEpicDeps } from '../../types';
import { isntNil, Address, Signed } from '../../utils/types';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { pluckDistinct, retryWhile } from '../../utils/rx';
import { Message } from '../../messages/types';
import { decodeJsonMessage, getMessageSigner } from '../../messages/utils';
import { getCap } from '../utils';

/**
 * Return the array of configured global rooms
 *
 * @param config - object to gather the list from
 * @returns Array of room names
 */
export function globalRoomNames(config: RaidenConfig) {
  return [config.discoveryRoom, config.pfsRoom, config.monitoringRoom].filter(isntNil);
}

/**
 * Curried function (arity=2) which matches room passed as second argument based on roomId, name or
 * alias passed as first argument
 *
 * @param roomIdOrAlias - Room Id, name, canonical or normal alias for room
 * @param room - Room to test
 * @returns True if room matches term, false otherwise
 */
export const roomMatch = curry(
  (roomIdOrAlias: string, room: Room) =>
    roomIdOrAlias === room.roomId ||
    roomIdOrAlias === room.name ||
    roomIdOrAlias === room.getCanonicalAlias() ||
    room.getAliases().includes(roomIdOrAlias),
);

/**
 * Returns an observable to a (possibly pending) room matching roomId or some alias
 * This method doesn't try to join the room, just wait for it to show up in MatrixClient.
 *
 * @param matrix - Client instance to fetch room info from
 * @param roomIdOrAlias - room id or alias to look for
 * @returns Observable to populated room instance
 */
export function getRoom$(matrix: MatrixClient, roomIdOrAlias: string): Observable<Room> {
  let room: Room | null | undefined = matrix.getRoom(roomIdOrAlias);
  if (!room) room = matrix.getRooms().find(roomMatch(roomIdOrAlias));
  if (room) return of(room);
  return fromEvent<Room>(matrix, 'Room').pipe(filter(roomMatch(roomIdOrAlias)), take(1));
}

/**
 * Waits for address to have joined a room with us (or webRTC channel) and sends a message
 *
 * @param address - Eth Address of peer/receiver
 * @param type - EventType (if allowRtc=false)
 * @param content - Event content
 * @param deps - Some members of RaidenEpicDeps needed
 * @param deps.log - Logger instance
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @param deps.matrix$ - Matrix async subject
 * @returns Observable of a string containing the roomAlias or channel label
 */
export function waitMemberAndSend$<C extends { msgtype: string; body: string }>(
  address: Address,
  type: EventType,
  content: C,
  {
    log,
    latest$,
    config$,
    matrix$,
  }: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$' | 'matrix$'>,
): Observable<string> {
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
  return via$.pipe(
    switchMap((via) => {
      if (!via) return EMPTY;
      else if (typeof via !== 'string')
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
  );
}

/**
 * Parse a received message into either a Message or Signed<Message>
 * If Signed, the signer must match the sender's address.
 * Errors are logged and undefined returned
 *
 * @param line - String to be parsed as a single message
 * @param address - Sender's address
 * @param deps - Dependencies
 * @param deps.log - Logger instance
 * @returns Validated Signed or unsigned Message, or undefined
 */
export function parseMessage(
  line: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  address: Address,
  { log }: Pick<RaidenEpicDeps, 'log'>,
): Message | Signed<Message> | undefined {
  if (typeof line !== 'string') return;
  try {
    const message = decodeJsonMessage(line);
    // if Signed, accept only if signature matches sender address
    if ('signature' in message) {
      const signer = getMessageSigner(message);
      if (signer !== address)
        throw new RaidenError(ErrorCodes.TRNS_MESSAGE_SIGNATURE_MISMATCH, {
          sender: address,
          signer,
        });
    }
    return message;
  } catch (err) {
    log.warn(`Could not decode message: ${line}: ${err}`);
  }
}
