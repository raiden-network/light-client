import { Observable } from 'rxjs';
import { filter, scan, startWith, share } from 'rxjs/operators';
import { isActionOf } from 'typesafe-actions';
import { memoize } from 'lodash';

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
