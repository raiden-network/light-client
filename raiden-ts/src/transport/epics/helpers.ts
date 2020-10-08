import { Observable, of, fromEvent, timer, throwError, combineLatest } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  withLatestFrom,
  take,
  retryWhen,
  startWith,
  pluck,
} from 'rxjs/operators';
import curry from 'lodash/curry';
import { Room, MatrixClient, EventType } from 'matrix-js-sdk';

import { Capabilities } from '../../constants';
import { RaidenConfig } from '../../config';
import { RaidenEpicDeps } from '../../types';
import { isntNil, Address, Signed } from '../../utils/types';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { pluckDistinct } from '../../utils/rx';
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

function waitMember$(
  matrix: MatrixClient,
  address: Address,
  { latest$ }: Pick<RaidenEpicDeps, 'latest$'>,
) {
  return combineLatest([
    latest$.pipe(
      pluckDistinct('presences', address),
      filter((presence) => !!presence?.payload?.available),
    ),
    latest$.pipe(
      map(({ state }) => state.transport.rooms?.[address]?.[0]),
      // wait for a room to exist (created or invited) for address
      filter(isntNil),
      distinctUntilChanged(),
    ),
    fromEvent(matrix, 'Room').pipe(startWith(null)),
    fromEvent(matrix, 'RoomMember.membership').pipe(startWith(null)),
  ]).pipe(
    filter(
      ([presence, roomId]) =>
        matrix.getRoom(roomId)?.getMember?.(presence.payload.userId)?.membership === 'join',
    ),
    pluck(1),
    take(1),
  );
}

/**
 * Waits for address to have joined a room with us (or webRTC channel) and sends a message
 *
 * @param address - Eth Address of peer/receiver
 * @param matrix - Matrix client instance
 * @param type - EventType (if allowRtc=false)
 * @param content - Event content
 * @param deps - Some members of RaidenEpicDeps needed
 * @param deps.log - Logger instance
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @param allowRtc - False to force Room message, or true to allow webRTC channel, if available
 * @returns Observable of a string containing the roomAlias or channel label
 */
export function waitMemberAndSend$<C extends { msgtype: string; body: string }>(
  address: Address,
  matrix: MatrixClient,
  type: EventType,
  content: C,
  { log, latest$, config$ }: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
  allowRtc = false,
): Observable<string> {
  const RETRY_COUNT = 3; // is this relevant enough to become a constant/setting?
  return latest$.pipe(
    filter(({ presences }) => !!presences[address]?.payload?.available),
    take(1),
    withLatestFrom(config$),
    mergeMap(([{ presences, rtc }, { caps }]) => {
      // if available & open, use channel
      if (allowRtc && rtc[address]?.readyState === 'open') return of(rtc[address]);
      // if available and Capabilities.TO_DEVICE enabled on both ends, use ToDevice messages
      if (
        getCap(caps, Capabilities.TO_DEVICE) &&
        getCap(presences[address].payload.caps, Capabilities.TO_DEVICE)
      )
        return of(presences[address].payload.userId);
      return waitMember$(matrix, address, { latest$ });
    }),
    mergeMap(async (via) => {
      if (typeof via !== 'string') via.send(content.body);
      // via RTC channel
      else if (via.startsWith('@')) await matrix.sendToDevice(type, { [via]: { '*': content } });
      // via toDevice message
      else await matrix.sendEvent(via, type, content, ''); // via room
      // this returned value is just for notification, and shouldn't be relayed on;
      // all functionality is provided as side effects of the subscription
      return typeof via !== 'string' ? via.label : via;
    }),
    retryWhen((err$) =>
      // if sendEvent throws, omit & retry since first 'latest$' after pollingInterval
      // up to RETRY_COUNT times; if it continues to error, throws down
      err$.pipe(
        withLatestFrom(config$),
        mergeMap(([err, { pollingInterval }], i) => {
          if (i < RETRY_COUNT - 1) {
            log.warn(`messageSend error, retrying ${i + 1}/${RETRY_COUNT}`, err);
            return timer(pollingInterval);
            // give up
          } else return throwError(err);
        }),
      ),
    ),
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
