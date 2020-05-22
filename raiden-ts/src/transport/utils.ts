import { Observable } from 'rxjs';
import { filter, scan, startWith, share } from 'rxjs/operators';
import memoize from 'lodash/memoize';

import { RaidenAction } from '../actions';
import { Presences, Caps } from './types';
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

/**
 * Stringify a caps mapping
 *
 * @param caps - Capabilities object/mapping
 * @returns stringified version of caps
 */
export function stringifyCaps(caps: Caps): string {
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
export function parseCaps(caps?: string | null): Caps | undefined {
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
