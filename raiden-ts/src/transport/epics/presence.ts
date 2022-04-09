import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import type { Observable } from 'rxjs';
import { of } from 'rxjs';
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
  shareReplay,
  startWith,
  switchMap,
  tap,
  timeout,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { channelMonitored } from '../../channels/actions';
import { intervalFromConfig } from '../../config';
import type { PFS } from '../../services/types';
import { choosePfs$, getPresenceFromService$ } from '../../services/utils';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { isActionOf } from '../../utils/actions';
import { networkErrors } from '../../utils/error';
import { catchAndLog, completeWith, retryWhile, withMergeFrom } from '../../utils/rx';
import type { Address, Last } from '../../utils/types';
import { matrixPresence } from '../actions';
import { stringifyCaps } from '../utils';

/**
 * Fetch peer's presence info from services
 *
 * @param address - Address of interest
 * @param pfs$ - Observable of cached best PFS
 * @param deps - Epics dependencies
 * @returns Observable of user with most recent presence
 */
function searchAddressPresence$(
  address: Address,
  pfs$: Observable<PFS>,
  deps: Pick<RaidenEpicDeps, 'config$'> & Last<Parameters<typeof getPresenceFromService$>>,
) {
  return pfs$.pipe(
    withLatestFrom(deps.config$),
    concatMap(([{ url }, { httpTimeout }]) =>
      getPresenceFromService$(address, url, deps).pipe(
        timeout(httpTimeout),
        // this catchAndLog will suppress error and retry next PFS only if error is a networkError,
        // otherwise (e.g. address offline) will error early and become matrixPresence.failure
        catchAndLog(
          { onErrors: networkErrors, log: deps.log.debug },
          'Error fetching presence from service',
          address,
          url,
        ),
      ),
    ),
    first(),
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
  const pfs$ = choosePfs$(undefined, deps, true).pipe(shareReplay());
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
          return searchAddressPresence$(address, pfs$, deps);
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
        withMergeFrom(async (matrix) =>
          matrix.setAvatarUrl(caps && !isEmpty(caps) ? stringifyCaps(caps) : ''),
        ),
        filter(() => synced),
        withMergeFrom(async ([matrix]) =>
          matrix.setPresence({ presence: 'offline', status_msg: '' }),
        ),
        withMergeFrom(async ([[matrix]]) =>
          matrix.setPresence({ presence: 'online', status_msg: Date.now().toString() }),
        ),
        retryWhile(intervalFromConfig(config$)),
      ),
    ),
    ignoreElements(),
  );
}
