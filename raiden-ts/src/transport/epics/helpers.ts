import curry from 'lodash/curry';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import type { Observable } from 'rxjs';
import { fromEvent, of } from 'rxjs';
import { filter, take } from 'rxjs/operators';

import type { RaidenConfig } from '../../config';
import type { Message } from '../../messages/types';
import { decodeJsonMessage, getMessageSigner } from '../../messages/utils';
import type { RaidenEpicDeps } from '../../types';
import { ErrorCodes, RaidenError } from '../../utils/error';
import type { Address, Signed } from '../../utils/types';
import { isntNil } from '../../utils/types';

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
