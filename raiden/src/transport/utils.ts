import { Observable } from 'rxjs';
import { filter, scan, startWith } from 'rxjs/operators';
import { isActionOf } from 'typesafe-actions';

import { RaidenAction } from '../actions';
import { Presences } from './types';
import { matrixPresenceUpdate } from './actions';

/**
 * Helper to map/get an aggregated Presences observable from action$ bus
 * Known presences as { address: <last seen MatrixPresenceUpdateAction> } mapping
 * As this helper is basically a scan/reduce, you can't simply startWith the first/initial value,
 * as it needs to also be the initial mapping for the scan itself, so instead of pipe+startWith,
 * as we usually do with state$, we need to get the initial value as parameter when it's used in
 * withLatestFrom in some inner observable
 * @param action$ Observable
 * @returns Observable of aggregated Presences from subscription to now
 */
export const getPresences$ = (action$: Observable<RaidenAction>): Observable<Presences> =>
  action$.pipe(
    filter(isActionOf(matrixPresenceUpdate)),
    scan(
      // scan all presence update actions and populate/output a per-address mapping
      (presences, update) => ({
        ...presences,
        [update.meta.address]: update,
      }),
      {},
    ),
    startWith({}),
  );
