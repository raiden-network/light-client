import { Observable, of, EMPTY, fromEvent, defer } from 'rxjs';
import {
  catchError,
  filter,
  groupBy,
  map,
  mergeMap,
  withLatestFrom,
  scan,
  startWith,
  switchMap,
  toArray,
  pluck,
  exhaustMap,
  skip,
  ignoreElements,
  distinctUntilChanged,
} from 'rxjs/operators';
import minBy from 'lodash/minBy';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import pick from 'lodash/pick';
import { getAddress } from '@ethersproject/address';
import { verifyMessage } from '@ethersproject/wallet';
import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';

import { assert } from '../../utils';
import { RaidenError, ErrorCodes } from '../../utils/error';
import { Address, isntNil } from '../../utils/types';
import { isActionOf } from '../../utils/actions';
import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../../state';
import { getUserPresence } from '../../utils/matrix';
import { pluckDistinct, retryWhile } from '../../utils/rx';
import { matrixPresence } from '../actions';
import { channelMonitored } from '../../channels/actions';
import { parseCaps, stringifyCaps } from '../utils';
import { intervalFromConfig } from '../../config';

// unavailable just means the user didn't do anything over a certain amount of time, but they're
// still there, so we consider the user as available/online then
const AVAILABLE = ['online', 'unavailable'];
const userRe = /^@(0x[0-9a-f]{40})[.:]/i;

/**
 * Search user directory for valid users matching a given address and return latest
 *
 * @param matrix - Matrix client to search users from
 * @param address - Address of interest
 * @param opts - Options
 * @param opts.log - Logger instance
 * @returns Observable of user with most recent presence
 */
function searchAddressPresence$(
  matrix: MatrixClient,
  address: Address,
  { log }: { log: RaidenEpicDeps['log'] },
) {
  return defer(() =>
    // search for any user containing the address of interest in its userId
    matrix.searchUserDirectory({ term: address.toLowerCase() }),
  ).pipe(
    // for every result matches, verify displayName signature is address of interest
    mergeMap(function* ({ results }) {
      for (const user of results) {
        if (!user.display_name) continue;
        try {
          const match = userRe.exec(user.user_id);
          if (!match || getAddress(match[1]) !== address) continue;
          const recovered = verifyMessage(user.user_id, user.display_name);
          if (!recovered || recovered !== address) continue;
        } catch (err) {
          continue;
        }
        yield user;
      }
    }),
    mergeMap((user) =>
      getUserPresence(matrix, user.user_id)
        .then((presence) => ({ ...presence, ...user }))
        .catch((err) => (log.info('Error fetching user presence, ignoring:', err), undefined)),
    ),
    filter(isntNil),
    toArray(),
    // for all matched/verified users, get its presence through dedicated API
    // it's required because, as the user events could already have been handled
    // and filtered out by matrixPresenceUpdateEpic because it wasn't yet a
    // user-of-interest, we could have missed presence updates, then we need to
    // fetch it here directly, and from now on, that other epic will monitor its
    // updates, and sort by most recently seen user
    map((presences) => {
      if (!presences.length) throw new RaidenError(ErrorCodes.TRNS_NO_VALID_USER, { address });
      return minBy(presences, 'last_active_ago')!;
    }),
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
 * @param deps.latest$ - Latest values
 * @param deps.log - Logger instance
 * @returns Observable of presence updates or fail action
 */
export function matrixMonitorPresenceEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, latest$, log }: RaidenEpicDeps,
): Observable<matrixPresence.success | matrixPresence.failure> {
  return action$.pipe(
    filter(isActionOf(matrixPresence.request)),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap((action) => matrix$.pipe(map((matrix) => ({ action, matrix })))),
    groupBy(({ action }) => action.meta.address),
    mergeMap((grouped$) =>
      grouped$.pipe(
        withLatestFrom(latest$.pipe(pluckDistinct('presences'))),
        // if we're already fetching presence for this address, no need to fetch again
        exhaustMap(([{ action, matrix }, presences]) =>
          action.meta.address in presences
            ? // we already monitored/saw this user's presence
              of(presences[action.meta.address])
            : searchAddressPresence$(matrix, action.meta.address, { log }).pipe(
                map(({ presence, user_id: userId, avatar_url }) =>
                  matrixPresence.success(
                    {
                      userId,
                      available: AVAILABLE.includes(presence),
                      ts: Date.now(),
                      caps: parseCaps(avatar_url),
                    },
                    action.meta,
                  ),
                ),
                catchError((err) => of(matrixPresence.failure(err, action.meta))),
              ),
        ),
      ),
    ),
  );
}

const comparePresencesFields = ['userId', 'available', 'caps'] as const;

/**
 * Monitor peers matrix presence from User.presence events
 * We aggregate all users of interest (i.e. for which a monitor request was emitted at some point)
 * and emit presence updates for any presence change happening to a user validating to this address
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.log - Logger instance
 * @param deps.matrix$ - MatrixClient async subject
 * @param deps.latest$ - Latest values
 * @param deps.config$ - Config observable
 * @returns Observable of presence updates
 */
export function matrixPresenceUpdateEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, matrix$, latest$, config$ }: RaidenEpicDeps,
): Observable<matrixPresence.success> {
  return matrix$
    .pipe(
      // when matrix finishes initialization, register to matrix presence events
      switchMap((matrix) =>
        // matrix's 'User.presence' sometimes fail to fire, but generic 'event' is always fired,
        // and User (retrieved via matrix.getUser) is up-to-date before 'event' emits
        fromEvent<MatrixEvent>(matrix, 'event').pipe(
          filter((event) => event.getType() === 'm.presence'),
          map((event) => ({ event, matrix })),
        ),
      ),
      // parse peer address from userId
      map(({ event, matrix }) => {
        try {
          // as 'event' is emitted after user is (created and) updated, getUser always returns it
          const user = matrix.getUser(event.getSender());
          assert(user?.presence);
          const peerAddress = userRe.exec(user.userId)?.[1];
          assert(peerAddress);
          // getAddress will convert any valid address into checksummed-format
          const address = getAddress(peerAddress) as Address | undefined;
          assert(address);
          return { matrix, user, address, event };
        } catch (err) {}
      }),
      // filter out events without userId in the right format (startWith hex-address)
      filter(isntNil),
      withLatestFrom(
        // observable of all addresses whose presence monitoring was requested since init
        action$.pipe(
          filter(matrixPresence.request.is),
          scan((toMonitor, request) => toMonitor.add(request.meta.address), new Set<Address>()),
          startWith(new Set<Address>()),
        ),
      ),
      // filter out events from users we don't care about
      // i.e.: presence monitoring never requested
      filter(([{ address }, toMonitor]) => toMonitor.has(address)),
      mergeMap(([{ matrix, user, address }]) =>
        defer(async () =>
          // always fetch profile info, to get up-to-date displayname, avatar_url & presence
          Promise.all([matrix.getProfileInfo(user.userId), getUserPresence(matrix, user.userId)]),
        ).pipe(
          map(([profile, { presence, last_active_ago }]) => {
            // errors raised here will be logged and ignored on catchError below
            assert(profile?.displayname, 'no displayname');
            // ecrecover address, validating displayName is the signature of the userId
            const recovered = verifyMessage(user.userId, profile.displayname) as
              | Address
              | undefined;
            assert(
              recovered === address,
              `invalid displayname signature: ${recovered} !== ${address}`,
            );
            const available = AVAILABLE.includes(presence);
            if (presence !== user.presence)
              log.warn('Presence mismatch', { user, presence, last_active_ago });
            return matrixPresence.success(
              {
                userId: user.userId,
                available,
                ts: last_active_ago
                  ? Date.now() - last_active_ago
                  : user.lastPresenceTs ?? Date.now(),
                caps: parseCaps(profile.avatar_url),
              },
              { address: recovered },
            );
          }),
          retryWhile(
            intervalFromConfig(config$),
            { maxRetries: 10, onErrors: [429] }, // retry rate-limit errors only
          ),
          catchError(
            (err) => (
              log.warn('Error validating presence event, ignoring', user.userId, err), EMPTY
            ),
          ),
        ),
      ),
    )
    .pipe(
      withLatestFrom(latest$),
      filter(
        ([action, { presences }]) =>
          // filter out if presence update is to offline, and address became online in another user
          (action.payload.available ||
            !(action.meta.address in presences) ||
            !presences[action.meta.address].payload.available ||
            action.payload.userId === presences[action.meta.address].payload.userId) &&
          // pass only if some relevant field changed
          !isEqual(
            pick(action.payload, comparePresencesFields),
            pick(presences[action.meta.address]?.payload, comparePresencesFields),
          ),
      ),
      pluck(0),
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
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, config$ }: RaidenEpicDeps,
): Observable<never> {
  return config$.pipe(
    pluck('caps'),
    distinctUntilChanged(isEqual),
    skip(1), // skip replay(1) and act only on changes
    mergeMap((caps) => matrix$.pipe(map((matrix) => [caps, matrix] as const))),
    mergeMap(async ([caps, matrix]) =>
      matrix.setAvatarUrl(caps && !isEmpty(caps) ? stringifyCaps(caps) : '').catch(() => {
        /* ignore http errors */
      }),
    ),
    ignoreElements(),
  );
}
