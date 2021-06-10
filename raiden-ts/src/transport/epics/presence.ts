import { verifyMessage } from '@ethersproject/wallet';
import getOr from 'lodash/fp/getOr';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import minBy from 'lodash/minBy';
import type { Observable } from 'rxjs';
import { defer, EMPTY, merge, of } from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  exhaustMap,
  filter,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  pluck,
  skip,
  switchMap,
  tap,
  toArray,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { channelMonitored } from '../../channels/actions';
import { intervalFromConfig } from '../../config';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { assert, ErrorCodes, networkErrors } from '../../utils/error';
import { getUserPresence } from '../../utils/matrix';
import { completeWith, mergeWith, retryWhile } from '../../utils/rx';
import type { Address } from '../../utils/types';
import { matrixPresence } from '../actions';
import { getAddressFromUserId, parseCaps, stringifyCaps } from '../utils';

// unavailable just means the user didn't do anything over a certain amount of time, but they're
// still there, so we consider the user as available/online then
const AVAILABLE = ['online', 'unavailable'];

/**
 * Search user directory for valid users matching a given address and return latest
 *
 * @param address - Address of interest
 * @param deps - Epics dependencies subset
 * @param deps.log - Logger instance
 * @param deps.matrix$ - Matrix client instance observable
 * @param deps.config$ - Config observable
 * @returns Observable of user with most recent presence
 */
function searchAddressPresence$(
  address: Address,
  { log, matrix$, config$ }: Pick<RaidenEpicDeps, 'log' | 'matrix$' | 'config$'>,
) {
  // search for any user containing the address of interest in its userId
  return matrix$.pipe(
    mergeWith(async (matrix) => matrix.searchUserDirectory({ term: address.toLowerCase() })),
    retryWhile(intervalFromConfig(config$), { onErrors: networkErrors }),
    // for every result matches, verify displayName signature is address of interest
    mergeWith(function* ([, { results }]) {
      for (const user of results) {
        if (!user.display_name) continue;
        try {
          if (getAddressFromUserId(user.user_id) !== address) continue;
          const recovered = verifyMessage(user.user_id, user.display_name);
          if (!recovered || recovered !== address) continue;
        } catch (err) {
          continue;
        }
        yield user;
      }
    }),
    mergeMap(
      ([[matrix], user]) =>
        defer(async () => getUserPresence(matrix, user.user_id)).pipe(
          map((presence) => ({ ...presence, ...user })),
          retryWhile(intervalFromConfig(config$), { onErrors: networkErrors }),
          catchError((err) => {
            log.info('Error fetching user presence, ignoring:', err);
            return EMPTY;
          }),
        ),
      3, // max parallelism on these requests
    ),
    toArray(),
    // for all matched/verified users, get its presence through dedicated API
    // it's required because, as the user events could already have been handled
    // and filtered out by matrixPresenceUpdateEpic because it wasn't yet a
    // user-of-interest, we could have missed presence updates, then we need to
    // fetch it here directly, and from now on, that other epic will monitor its
    // updates, and sort by most recently seen user
    map((presences) => {
      assert(presences.length, [ErrorCodes.TRNS_NO_VALID_USER, { address }]);
      return minBy(presences, getOr(Number.POSITIVE_INFINITY, 'last_active_ago'))!;
    }),
    map(({ presence, user_id: userId, avatar_url }) =>
      matrixPresence.success(
        {
          userId,
          available: AVAILABLE.includes(presence),
          ts: Date.now(),
          caps: parseCaps(avatar_url),
        },
        { address },
      ),
    ),
    catchError((err) => of(matrixPresence.failure(err, { address }))),
  );
}

/**
 * Handles MatrixRequestMonitorPresenceAction and emits a MatrixPresenceUpdateAction
 * If presence is already known, emits it, else fetch from user profile
 * Even if the presence stays the same, we emit a MatrixPresenceUpdateAction, as this may be a
 * request being waited by a promise or something like that
 * IOW: every request should be followed by a presence update or a failed action, but presence
 * updates may happen later without new requests (e.g. when the user goes offline)
 *
 * @param action$ - Observable of matrixPresence.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.log - Logger instance
 * @param deps.config$ - Config observable
 * @returns Observable of presence updates or fail action
 */
export function matrixMonitorPresenceEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<matrixPresence.success | matrixPresence.failure> {
  const { latest$, config$ } = deps;
  const cache = new Map<Address, matrixPresence.success>();
  return action$.pipe(
    filter(isActionOf(matrixPresence.request)),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    groupBy((action) => action.meta.address),
    withLatestFrom(
      merge(
        action$.pipe(
          filter(isActionOf([matrixPresence.success, matrixPresence.failure])),
          tap((action) => {
            if (matrixPresence.success.is(action)) cache.set(action.meta.address, action);
            else cache.delete(action.meta.address);
          }),
          ignoreElements(),
        ),
        of(cache),
      ),
    ),
    mergeMap(([grouped$, cache]) =>
      grouped$.pipe(
        withLatestFrom(latest$, config$),
        // if we're already fetching presence for this address, no need to fetch again
        exhaustMap(([action, { rtc }, { httpTimeout }]) => {
          const { address } = action.meta;
          const cached = cache.get(address);
          // we already fetched this peer's presence recently, or there's an RTC channel with them
          if (cached && (Date.now() - cached.payload.ts < httpTimeout || address in rtc))
            return of(cached);
          return searchAddressPresence$(address, deps);
        }),
      ),
    ),
  );
}

/**
 * Channel monitoring triggers matrix presence monitoring for partner
 *
 * @param action$ - Observable of RaidenActions
 * @returns Observable of matrixPresence.request actions
 */
export function matrixMonitorChannelPresenceEpic(
  action$: Observable<RaidenAction>,
): Observable<matrixPresence.request> {
  return action$.pipe(
    filter(channelMonitored.is),
    map((action) => matrixPresence.request(undefined, { address: action.meta.partner })),
  );
}

/**
 * Update our matrix's avatarUrl on config.caps changes
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config object
 * @returns Observable which never emits
 */
export function matrixUpdateCapsEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, config$ }: RaidenEpicDeps,
): Observable<never> {
  return config$.pipe(
    completeWith(action$),
    pluck('caps'),
    distinctUntilChanged(isEqual),
    skip(1), // skip replay(1) and act only on changes
    switchMap((caps) =>
      matrix$.pipe(
        mergeMap((matrix) =>
          defer(async () =>
            matrix.setAvatarUrl(caps && !isEmpty(caps) ? stringifyCaps(caps) : ''),
          ).pipe(
            // trigger immediate presence updates on peers
            mergeMap(async () =>
              matrix.setPresence({ presence: 'online', status_msg: Date.now().toString() }),
            ),
          ),
        ),
        retryWhile(intervalFromConfig(config$)),
        ignoreElements(),
      ),
    ),
  );
}
