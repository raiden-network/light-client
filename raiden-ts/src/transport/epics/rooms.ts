import type { Room } from 'matrix-js-sdk';
import type { Observable } from 'rxjs';
import { fromEvent, timer } from 'rxjs';
import { delayWhen, filter, ignoreElements, mergeMap, withLatestFrom } from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { completeWith, withMergeFrom } from '../../utils/rx';

/**
 * Leave any (new or invited) room
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config observable
 * @returns Empty observable (whole side-effect on matrix instance)
 */
export function matrixLeaveUnknownRoomsEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, matrix$, config$ }: RaidenEpicDeps,
): Observable<RaidenAction> {
  return matrix$.pipe(
    // when matrix finishes initialization, register to matrix Room events
    withMergeFrom((matrix) => fromEvent<Room>(matrix, 'Room')),
    withLatestFrom(config$),
    // this room may become known later for some reason, so wait a little
    delayWhen(([, { httpTimeout }]) =>
      timer(Math.round((0.5 + 0.5 * Math.random()) * httpTimeout)),
    ),
    completeWith(state$),
    // filter for leave events to us
    filter(([[, room]]) => {
      const myMembership = room.getMyMembership();
      if (!myMembership || myMembership === 'leave') return false; // room already gone while waiting
      return true;
    }),
    mergeMap(async ([[matrix, room]]) => {
      log.warn('Unknown room in matrix, leaving', room.roomId);
      return matrix
        .leave(room.roomId)
        .catch((err) => log.error('Error leaving unknown room, ignoring', err));
    }),
    ignoreElements(),
  );
}
