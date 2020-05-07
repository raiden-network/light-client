/* eslint-disable @typescript-eslint/camelcase */
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
} from 'rxjs/operators';
import minBy from 'lodash/minBy';

import { getAddress, verifyMessage } from 'ethers/utils';

import { MatrixClient, MatrixEvent } from 'matrix-js-sdk';

import { RaidenError, ErrorCodes } from '../../utils/error';
import { Address, isntNil, assert, Signature } from '../../utils/types';
import { isActionOf } from '../../utils/actions';
import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../../state';
import { getUserPresence } from '../../utils/matrix';
import { pluckDistinct } from '../../utils/rx';
import { matrixPresence } from '../actions';
import { channelMonitor } from '../../channels/actions';
import { parseCaps } from './helpers';

// unavailable just means the user didn't do anything over a certain amount of time, but they're
// still there, so we consider the user as available/online then
const AVAILABLE = ['online', 'unavailable'];
const userRe = /^@(0x[0-9a-f]{40})[.:]/i;

/**
 * Search user directory for valid users matching a given address and return latest
 *
 * @param matrix - Matrix client to search users from
 * @param address - Address of interest
 * @param log - Logger object
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
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of presence updates or fail action
 */
export const matrixMonitorPresenceEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, latest$, log }: RaidenEpicDeps,
): Observable<matrixPresence.success | matrixPresence.failure> =>
  action$.pipe(
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

/**
 * Monitor peers matrix presence from User.presence events
 * We aggregate all users of interest (i.e. for which a monitor request was emitted at some point)
 * and emit presence updates for any presence change happening to a user validating to this address
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param matrix$ - RaidenEpicDeps members
 * @returns Observable of presence updates
 */
export const matrixPresenceUpdateEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, matrix$, latest$ }: RaidenEpicDeps,
): Observable<matrixPresence.success> =>
  matrix$
    .pipe(
      // when matrix finishes initialization, register to matrix presence events
      switchMap((matrix) =>
        // matrix's 'User.presence' sometimes fail to fire, but generic 'event' is always fired,
        // and User (retrieved via matrix.getUser) is up-to-date before 'event' emits
        fromEvent<MatrixEvent>(matrix, 'event').pipe(map((event) => ({ event, matrix }))),
      ),
      filter(({ event }) => event.getType() === 'm.presence'),
      // parse peer address from userId
      map(({ event, matrix }) => {
        // as 'event' is emitted after user is (created and) updated, getUser always returns it
        const user = matrix.getUser(event.getSender());
        if (!user || !user.presence) return;
        const match = userRe.exec(user.userId),
          peerAddress = match && match[1];
        if (!peerAddress) return;
        // getAddress will convert any valid address into checksummed-format
        const address = getAddress(peerAddress) as Address | undefined;
        if (!address) return;
        return { matrix, user, address };
      }),
      // filter out events without userId in the right format (startWith hex-address)
      filter(isntNil),
      withLatestFrom(
        // observable of all addresses whose presence monitoring was requested since init
        action$.pipe(
          filter(isActionOf(matrixPresence.request)),
          scan((toMonitor, request) => toMonitor.add(request.meta.address), new Set<Address>()),
          startWith(new Set<Address>()),
        ),
        // known presences as { address: <last seen MatrixPresenceUpdateAction> } mapping
        latest$.pipe(pluckDistinct('presences')),
      ),
      // filter out events from users we don't care about
      // i.e.: presence monitoring never requested
      filter(([{ address }, toMonitor]) => toMonitor.has(address)),
      mergeMap(([{ matrix, user, address }, , presences]) => {
        // first filter can't tell typescript this property will always be set!
        const userId = user.userId,
          presence = user.presence!,
          available = AVAILABLE.includes(presence);

        if (
          address in presences &&
          presences[address].payload.userId === userId &&
          presences[address].payload.available === available
        )
          // even if signature verification passes, this wouldn't change presence, so return early
          return EMPTY;

        // fetch profile info if user have no valid displayName set
        const profile$ = Signature.is(user.displayName)
          ? of({ displayname: user.displayName, avatar_url: user.avatarUrl })
          : defer(() => matrix.getProfileInfo(userId));

        return profile$.pipe(
          map((profile) => {
            // errors raised here will be logged and ignored on catchError below
            assert(profile?.displayname, 'no displayname');
            // ecrecover address, validating displayName is the signature of the userId
            const recovered = verifyMessage(userId, profile.displayname) as Address | undefined;
            assert(
              recovered === address,
              `invalid displayname signature: ${recovered} !== ${address}`,
            );
            return matrixPresence.success(
              {
                userId,
                available,
                ts: user.lastPresenceTs ?? Date.now(),
                caps: parseCaps(profile.avatar_url),
              },
              { address: recovered },
            );
          }),
          catchError(
            (err) => (log.debug('Error validating presence event, ignoring', err), EMPTY),
          ),
        );
      }),
    )
    .pipe(
      withLatestFrom(latest$),
      // filter out if presence update is to offline, and address became online in another user
      filter(
        ([action, { presences }]) =>
          action.payload.available ||
          !(action.meta.address in presences) ||
          !presences[action.meta.address].payload.available ||
          action.payload.userId === presences[action.meta.address].payload.userId,
      ),
      pluck(0),
    );

/**
 * Channel monitoring triggers matrix presence monitoring for partner
 *
 * @param action$ - Observable of RaidenActions
 * @returns Observable of matrixPresence.request actions
 */
export const matrixMonitorChannelPresenceEpic = (
  action$: Observable<RaidenAction>,
): Observable<matrixPresence.request> =>
  action$.pipe(
    filter(channelMonitor.is),
    map((action) => matrixPresence.request(undefined, { address: action.meta.partner })),
  );
