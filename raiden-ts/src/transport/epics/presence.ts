import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import uniq from 'lodash/uniq';
import type { Observable } from 'rxjs';
import { combineLatest, from, of } from 'rxjs';
import {
  catchError,
  concatMap,
  distinctUntilChanged,
  endWith,
  exhaustMap,
  filter,
  first,
  groupBy,
  ignoreElements,
  map,
  mergeMap,
  pluck,
  startWith,
  switchMap,
  tap,
  timeout,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { channelMonitored } from '../../channels/actions';
import { intervalFromConfig } from '../../config';
import { PfsMode } from '../../services/types';
import { getPresenceFromService$ } from '../../services/utils';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { networkErrors } from '../../utils/error';
import { catchAndLog, completeWith, mergeWith, retryWhile } from '../../utils/rx';
import type { Address } from '../../utils/types';
import { matrixPresence } from '../actions';
import { stringifyCaps } from '../utils';

/**
 * Fetch peer's presence info from services
 *
 * @param address - Address of interest
 * @param deps - Epics dependencies
 * @returns Observable of user with most recent presence
 */
function searchAddressPresence$(
  address: Address,
  deps: Pick<RaidenEpicDeps, 'latest$' | 'config$' | 'serviceRegistryContract' | 'log'>,
) {
  const { config$, latest$ } = deps;
  return combineLatest([latest$, config$]).pipe(
    first(),
    mergeMap(([{ state }, { pfsMode, additionalServices, httpTimeout }]) => {
      let services = additionalServices;
      if (pfsMode !== PfsMode.onlyAdditional)
        services = uniq([...services, ...Object.keys(state.services)]);
      return from(services).pipe(
        concatMap((service) =>
          getPresenceFromService$(address, service, deps).pipe(
            timeout(httpTimeout),
            catchAndLog(
              { onErrors: networkErrors, maxRetries: 1 },
              'Error fetching presence from service',
              address,
            ),
          ),
        ),
        first(),
      );
    }),
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
    tap((action) => {
      if (matrixPresence.success.is(action)) cache.set(action.meta.address, action);
      else if (matrixPresence.failure.is(action)) cache.delete(action.meta.address);
    }),
    filter(isActionOf(matrixPresence.request)),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    groupBy((action) => action.meta.address),
    mergeMap((grouped$) =>
      grouped$.pipe(
        withLatestFrom(latest$, config$),
        // if we're already fetching presence for this address, no need to fetch again
        exhaustMap(([action, { rtc }, { pollingInterval }]) => {
          const { address } = action.meta;
          const cached = cache.get(address);
          // we already fetched this peer's presence recently, or there's an RTC channel with them
          if (cached && (Date.now() - cached.payload.ts < pollingInterval || address in rtc))
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
 * Update our matrix's avatarUrl on config.caps on startup and changes
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.config$ - Config object
 * @param deps.init$ - Init$ subject
 * @returns Observable which never emits
 */
export function matrixUpdateCapsEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, config$, init$ }: RaidenEpicDeps,
): Observable<never> {
  return config$.pipe(
    completeWith(action$),
    pluck('caps'),
    distinctUntilChanged(isEqual),
    withLatestFrom(init$.pipe(ignoreElements(), startWith(false), endWith(true))),
    switchMap(([caps, synced]) =>
      matrix$.pipe(
        mergeWith(async (matrix) =>
          matrix.setAvatarUrl(caps && !isEmpty(caps) ? stringifyCaps(caps) : ''),
        ),
        filter(() => synced),
        mergeWith(async ([matrix]) => matrix.setPresence({ presence: 'offline', status_msg: '' })),
        mergeWith(async ([[matrix]]) =>
          matrix.setPresence({ presence: 'online', status_msg: Date.now().toString() }),
        ),
        retryWhile(intervalFromConfig(config$)),
      ),
    ),
    ignoreElements(),
  );
}
