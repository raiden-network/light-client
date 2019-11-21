import { Observable, of, fromEvent } from 'rxjs';
import { filter, scan, startWith, share, take } from 'rxjs/operators';
import { isActionOf } from 'typesafe-actions';
import { memoize, curry } from 'lodash';
import { MatrixClient, Room } from 'matrix-js-sdk';

import { RaidenAction } from '../actions';
import { RaidenConfig } from '../config';
import { isntNil } from '../utils/types';
import { Presences } from './types';
import { matrixPresenceUpdate } from './actions';

/**
 * Helper to map/get an aggregated Presences observable from action$ bus
 * Known presences as { address: <last seen MatrixPresenceUpdateAction> } mapping
 * It's memoized and shared, so all subscriptions share the same mapped/output object
 *
 * @param action$ - Observable
 * @returns Observable of aggregated Presences from subscription to now
 */
export const getPresences$ = memoize(
  (action$: Observable<RaidenAction>): Observable<Presences> =>
    action$.pipe(
      filter(isActionOf(matrixPresenceUpdate)),
      scan(
        // scan all presence update actions and populate/output a per-address mapping
        (presences, update) => ({
          ...presences,
          [update.meta.address]: update,
        }),
        {} as Presences,
      ),
      share(),
      startWith({}),
    ),
);

/**
 * Return the array of configured global rooms
 *
 * @param config - object to gather the list from
 * @returns Array of room names
 */
export function globalRoomNames(config: RaidenConfig) {
  return [config.discoveryRoom, config.pfsRoom].filter(isntNil);
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
  return fromEvent<Room>(matrix, 'Room').pipe(
    filter(roomMatch(roomIdOrAlias)),
    take(1),
  );
}
