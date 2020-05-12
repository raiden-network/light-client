import { Observable, of, EMPTY, fromEvent, timer, throwError, defer } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  withLatestFrom,
  switchMap,
  take,
  mapTo,
  pluck,
  retryWhen,
} from 'rxjs/operators';
import curry from 'lodash/curry';
import { Room, MatrixClient, EventType, RoomMember, MatrixEvent } from 'matrix-js-sdk';

import { RaidenConfig } from '../../config';
import { RaidenEpicDeps } from '../../types';
import { isntNil, Address, Signed } from '../../utils/types';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { Message } from '../../messages/types';
import { decodeJsonMessage, getMessageSigner } from '../../messages/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CapsMapping = { readonly [k: string]: any };

/**
 * Stringify a caps mapping
 *
 * @param caps - Capabilities object/mapping
 * @returns stringified version of caps
 */
export function stringifyCaps(caps: CapsMapping): string {
  return Object.entries(caps)
    .filter(([, v]) => typeof v !== 'boolean' || v)
    .map(([k, v]) => (typeof v === 'boolean' ? k : `${k}="${v}"`))
    .join(',');
}

/**
 * Parse a caps string in the format 'k1,k2=v2,k3="v3"' to { k1: true, k2: v2, k3: v3 } object
 *
 * @param caps - caps string
 * @returns Caps mapping object
 */
export function parseCaps(caps?: string | null): CapsMapping | undefined {
  if (!caps) return;
  const result: { [k: string]: string | boolean } = {};
  try {
    // this regex splits by comma, but respecting strings inside double-quotes
    for (const cap of caps.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/g)) {
      const match = cap.match(/^\s*([^=]+)(?: ?= ?"?(.*?)"?\s*)?$/);
      if (match) result[match[1]] = match[2] ?? true;
    }
    return result;
  } catch (err) {}
}

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
 * @param matrix - Matrix client instance
 * @param type - EventType (if allowRtc=false)
 * @param content - Event content
 * @param deps - Some members of RaidenEpicDeps needed
 * @param allowRtc - False to force Room message, or true to allow webRTC channel, if available
 * @returns Observable of a string containing the roomAlias or channel label
 */
export function waitMemberAndSend$(
  address: Address,
  matrix: MatrixClient,
  type: EventType,
  content: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  { log, latest$, config$ }: Pick<RaidenEpicDeps, 'log' | 'latest$' | 'config$'>,
  allowRtc = false,
): Observable<string> {
  const RETRY_COUNT = 3; // is this relevant enough to become a constant/setting?
  return latest$.pipe(
    filter(({ presences }) => address in presences),
    take(1),
    mergeMap(({ rtc }) => {
      // if available & open, use channel
      if (allowRtc && rtc?.[address]?.readyState === 'open') return of(rtc[address]);
      // else, wait for member to join in the first room, and return roomId
      return latest$.pipe(
        map(({ state }) => state.transport.rooms?.[address]?.[0]),
        // wait for a room to exist (created or invited) for address
        filter(isntNil),
        distinctUntilChanged(),
        // this switchMap unsubscribes from previous "wait" if first room for address changes
        switchMap((roomId) =>
          // get/wait room object for roomId
          // may wait for the room state to be populated (happens after createRoom resolves)
          getRoom$(matrix, roomId).pipe(
            mergeMap((room) =>
              // wait for address to be monitored & online (after getting Room for address)
              // latest$ ensures it happens immediatelly if all conditions are satisfied
              latest$.pipe(
                pluck('presences', address),
                map((presence) =>
                  presence?.payload?.available ? presence.payload.userId : undefined,
                ),
                distinctUntilChanged(),
                map((userId) => ({ room, userId })),
              ),
            ),
            // when user is online, get room member for partner's userId
            // this switchMap unsubscribes from previous wait if userId changes or go offline
            switchMap(({ room, userId }) => {
              if (!userId) return EMPTY; // user not monitored or not available
              const member = room.getMember(userId);
              // if it already joined room, return its membership
              if (member && member.membership === 'join') return of(member);
              // else, wait for the user to join/accept invite
              return fromEvent<RoomMember>(
                matrix,
                'RoomMember.membership',
                ({}: MatrixEvent, member: RoomMember) => member,
              ).pipe(
                filter(
                  (member) =>
                    member.roomId === room.roomId &&
                    member.userId === userId &&
                    member.membership === 'join',
                ),
              );
            }),
            pluck('roomId'),
          ),
        ),
      );
    }),
    take(1), // use first room/user which meets all requirements/filters above
    mergeMap((via) =>
      defer(
        () =>
          typeof via === 'string'
            ? matrix.sendEvent(via, type, content, '') // via room
            : via.send(content.body), // via RTC channel
      ).pipe(
        // this returned value is just for notification, and shouldn't be relayed on
        // all functionality is provided as side effects of the subscription
        mapTo(typeof via === 'string' ? via : via.label),
        retryWhen((err$) =>
          // if sendEvent throws, omit & retry after httpTimeout / N,
          // up to RETRY_COUNT times; if it continues to error, throws down
          err$.pipe(
            withLatestFrom(config$),
            mergeMap(([err, { httpTimeout }], i) => {
              if (i < RETRY_COUNT - 1) {
                log.warn(`messageSend error, retrying ${i + 1}/${RETRY_COUNT}`, err);
                return timer(httpTimeout / RETRY_COUNT);
                // give up
              } else return throwError(err);
            }),
          ),
        ),
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
 * @param deps - Logger dependency
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
