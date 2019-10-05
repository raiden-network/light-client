import { Observable, of, fromEvent } from 'rxjs';
import { filter, scan, startWith, share, take } from 'rxjs/operators';
import { isActionOf } from 'typesafe-actions';
import { memoize } from 'lodash';
import { MatrixClient, Room } from 'matrix-js-sdk';

import { RaidenAction } from '../actions';
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
 * Returns an observable to a (possibly pending) room matching roomId or some alias
 * This method doesn't try to join the room, just wait for it to show up in MatrixClient.
 *
 * @param matrix - Client instance to fetch room info from
 * @param roomIdOrAlias - room id or alias to look for
 * @returns Observable to populated room instance
 */
export function getRoom$(matrix: MatrixClient, roomIdOrAlias: string): Observable<Room> {
  let room: Room | null | undefined = matrix.getRoom(roomIdOrAlias);
  if (!room)
    room = matrix
      .getRooms()
      .find(
        r => roomIdOrAlias === r.getCanonicalAlias() || r.getAliases().includes(roomIdOrAlias),
      );
  if (room) return of(room);
  return fromEvent<Room>(matrix, 'Room').pipe(
    filter(
      room =>
        roomIdOrAlias == room.roomId ||
        roomIdOrAlias === room.getCanonicalAlias() ||
        room.getAliases().includes(roomIdOrAlias),
    ),
    take(1),
  );
}
