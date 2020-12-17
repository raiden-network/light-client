import { Observable } from 'rxjs';
import { filter, scan, startWith, share } from 'rxjs/operators';
import memoize from 'lodash/memoize';

import { RaidenAction } from '../actions';
import { Capabilities, CapsFallback } from '../constants';
import { jsonParse } from '../utils/data';
import { Address } from '../utils/types';
import { Presences, Caps, CapsPrimitive } from './types';
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
 * @param presences - Presences mapping
 * @param userId - Peer userId
 * @returns Presence of peer with userId
 */
export function getPresenceByUserId(
  presences: Presences,
  userId: string,
): matrixPresence.success | undefined {
  return Object.values(presences).find((presence) => presence.payload.userId === userId);
}

/**
 * Stringify a caps mapping to a caps url
 * E.g.'mxc://raiden.network/cap?k1=true&k2=v2&k2=v3&k4=null&k5=123'
 *
 * @param caps - Capabilities object/mapping
 * @returns stringified version of caps
 */
export function stringifyCaps(caps: Caps): string {
  const url = new URL('mxc://raiden.network/cap');
  // URLSearchParams.append can handle all primitives
  const appendParam = (key: string, value: CapsPrimitive) =>
    url.searchParams.append(key, value as string);
  for (const [key, value] of Object.entries(caps)) {
    if (Array.isArray(value)) value.forEach(appendParam.bind(null, key));
    else appendParam(key, value);
  }
  return url.href;
}

/**
 * Parse a caps string in the format 'mxc://raiden.network/cap?k1=true&k2=v2&k2=v3&k4=null&k5=123'
 * to a { k1: true, k2: ['v2','v3'], k4: null, k5: 123 } object
 *
 * @param caps - caps string
 * @returns Caps mapping object
 */
export function parseCaps(caps?: string | null): Caps | undefined {
  if (!caps) return;
  const result: Mutable<Caps> = {};
  try {
    const url = new URL(caps);
    url.searchParams.forEach((value, key) => {
      let resValue: Caps[string] = value;
      // interpret *some* types of values
      if (/^\d+$/.test(value)) resValue = jsonParse(value) as number | string;
      else {
        const lowValue = value.toLowerCase();
        if (lowValue === 'none' || lowValue === 'null') resValue = null;
        else if (lowValue === 'false') resValue = false;
        else if (lowValue === 'true') resValue = true;
      }
      if (!(key in result)) {
        result[key] = resValue;
      } else {
        let prevValues = result[key];
        if (!Array.isArray(prevValues)) result[key] = prevValues = [prevValues];
        prevValues.push(resValue);
      }
    });
    return result;
  } catch (err) {}
}

/**
 * @param caps - Our or partner caps object (possibly empty/undefined)
 * @param cap - Cap to fetch from
 * @returns Specified capability, with proper fallback
 */
export function getCap<C extends Capabilities>(caps: Caps | undefined | null, cap: C): Caps[C] {
  return caps?.[cap] ?? CapsFallback[cap];
}

/**
 * Return addresses sorted in lexical order
 *
 * @param addresses - Addresses to sort
 * @returns Addresses sorted in lexical order
 */
export function getSortedAddresses<A extends [Address, ...Address[]]>(...addresses: A) {
  return addresses.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())) as A;
}
