import { Observable } from 'rxjs';
import { filter, scan, startWith, share } from 'rxjs/operators';
import memoize from 'lodash/memoize';

import { RaidenAction } from '../actions';
import { Presences } from './types';
import { matrixPresence } from './actions';

/**
 * Helper to map/get an aggregated Presences observable from action$ bus
 * Known presences as { address: <last seen MatrixPresenceUpdateAction> } mapping
 * It's memoized and shared, so all subscriptions share the same mapped/output object, but the type
 * is explicitly set to avoid requiring the exported MemoizedFunction type
 *
 * @param action$ - Observable
 * @returns Observable of aggregated Presences from subscription to now
 */
export const getPresences$: (action$: Observable<RaidenAction>) => Observable<Presences> = memoize(
  (action$: Observable<RaidenAction>): Observable<Presences> =>
    action$.pipe(
      filter(matrixPresence.success.is),
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
