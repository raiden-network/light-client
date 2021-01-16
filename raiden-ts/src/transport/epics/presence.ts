import { Observable, of, EMPTY, fromEvent, defer, combineLatest } from 'rxjs';
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
import getOr from 'lodash/fp/getOr';
import { getAddress } from '@ethersproject/address';
import { verifyMessage } from '@ethersproject/wallet';
import { MatrixClient, MatrixEvent, User } from 'matrix-js-sdk';

import { assert } from '../../utils';
import { RaidenError, ErrorCodes, networkErrors } from '../../utils/error';
import { Address } from '../../utils/types';
import { isActionOf } from '../../utils/actions';
import { RaidenEpicDeps } from '../../types';
import { RaidenAction } from '../../actions';
import { RaidenState } from '../../state';
import { getUserPresence } from '../../utils/matrix';
import { completeWith, pluckDistinct, retryWhile } from '../../utils/rx';
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
 * @param opts.config$ - Config observable
 * @returns Observable of user with most recent presence
 */
function searchAddressPresence$(
  matrix: MatrixClient,
  address: Address,
  { log, config$ }: Pick<RaidenEpicDeps, 'log' | 'config$'>,
) {
  // search for any user containing the address of interest in its userId
  return defer(async () => matrix.searchUserDirectory({ term: address.toLowerCase() })).pipe(
    retryWhile(intervalFromConfig(config$), { onErrors: networkErrors }),
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
    mergeMap(
      (user) =>
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
      if (!presences.length) throw new RaidenError(ErrorCodes.TRNS_NO_VALID_USER, { address });
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
 * @param deps.latest$ - Latest values
 * @param deps.log - Logger instance
 * @param deps.config$ - Config observable
 * @returns Observable of presence updates or fail action
 */
export function matrixMonitorPresenceEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { matrix$, latest$, config$, log }: RaidenEpicDeps,
): Observable<matrixPresence.success | matrixPresence.failure> {
  return action$.pipe(
    filter(isActionOf(matrixPresence.request)),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap((action) => matrix$.pipe(map((matrix) => ({ action, matrix })))),
    groupBy(({ action }) => action.meta.address),
    mergeMap((grouped$) =>
      grouped$.pipe(
        withLatestFrom(latest$),
        // if we're already fetching presence for this address, no need to fetch again
        exhaustMap(([{ action, matrix }, { presences }]) => {
          // we already monitored/saw this user's presence
          if (action.meta.address in presences) return of(presences[action.meta.address]);
          return searchAddressPresence$(matrix, action.meta.address, { log, config$ });
        }),
      ),
    ),
  );
}

const comparePresencesFields = ['userId', 'available', 'caps'] as const;
type PresenceContent = ReturnType<typeof getUserPresence> extends PromiseLike<infer U> ? U : never;
type MatrixPresenceEvent = Omit<MatrixEvent, 'getContent'> & {
  getContent: () => PresenceContent;
};

// observable of all addresses whose presence monitoring was requested since init
function toMonitor$(action$: Observable<RaidenAction>) {
  const toMonitor = new Set<Address>();
  return action$.pipe(
    filter(matrixPresence.request.is),
    scan((toMonitor, request) => toMonitor.add(request.meta.address), toMonitor),
    startWith(toMonitor),
  );
}

function fetchPresence$(
  user: User,
  address: Address,
  event: MatrixPresenceEvent,
  {
    log,
    config$,
    latest$,
    matrix$,
  }: Pick<RaidenEpicDeps, 'log' | 'config$' | 'latest$' | 'matrix$'>,
) {
  return matrix$.pipe(
    switchMap((matrix) =>
      combineLatest([
        // always fetch profile info, to get up-to-date displayname, avatar_url & presence
        defer(async () => matrix.getProfileInfo(user.userId)),
        defer(async () =>
          AVAILABLE.includes(event.getContent().presence)
            ? event.getContent()
            : getUserPresence(matrix, user.userId),
        ),
        latest$.pipe(pluckDistinct('rtc', address)),
      ]),
    ),
    map(([profile, { presence, last_active_ago }, rtc]) => {
      // errors raised here will be logged and ignored on catchError below
      assert(profile?.displayname, 'no displayname');
      // ecrecover address, validating displayName is the signature of the userId
      const recovered = verifyMessage(user.userId, profile.displayname) as Address | undefined;
      assert(recovered === address, `invalid displayname signature: ${recovered} !== ${address}`);
      if (presence !== user.presence)
        log.warn('Presence mismatch', { user, presence, last_active_ago });
      // react on both presence events and rtc channel presence
      const available = AVAILABLE.includes(presence) || !!rtc;
      return matrixPresence.success(
        {
          userId: user.userId,
          available,
          ts: last_active_ago ? Date.now() - last_active_ago : user.lastPresenceTs ?? Date.now(),
          caps: parseCaps(profile.avatar_url),
        },
        { address: recovered },
      );
    }),
    retryWhile(intervalFromConfig(config$), { onErrors: networkErrors }),
    catchError((err) => {
      log.warn('Error validating presence event, ignoring', user.userId, event, err);
      return EMPTY;
    }),
  );
}

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
  deps: RaidenEpicDeps,
): Observable<matrixPresence.success> {
  const { matrix$, latest$ } = deps;
  return matrix$.pipe(
    // when matrix finishes initialization, register to matrix presence events
    switchMap((matrix) =>
      // matrix's 'User.presence' sometimes fail to fire, but generic 'event' is always fired,
      // and User (retrieved via matrix.getUser) is up-to-date before 'event' emits
      fromEvent<MatrixPresenceEvent>(matrix, 'event').pipe(
        completeWith(action$),
        filter((event) => event.getType() === 'm.presence'),
        // parse peer address from userId
        mergeMap(function* (event) {
          try {
            // as 'event' is emitted after user is (created and) updated, getUser always returns it
            const user = matrix.getUser(event.getSender());
            assert(user?.presence);
            const peerAddress = userRe.exec(user.userId)?.[1];
            assert(peerAddress);
            // getAddress will convert any valid address into checksummed-format
            const address = getAddress(peerAddress) as Address;
            // filter out events from users we don't care about
            // i.e.: presence monitoring never requested
            yield { user, address, event };
          } catch (err) {}
        }),
      ),
    ),
    withLatestFrom(toMonitor$(action$)),
    filter(([{ address }, toMonitor]) => toMonitor.has(address)),
    groupBy(([{ address }]) => address),
    mergeMap((grouped$) =>
      grouped$.pipe(
        switchMap(([{ user, address, event }]) => fetchPresence$(user, address, event, deps)),
        completeWith(action$),
      ),
    ),
    withLatestFrom(latest$),
    // filter out if presence update is to offline, and address became online in another user
    filter(
      ([action, { presences }]) =>
        action.payload.available ||
        !(action.meta.address in presences) ||
        !presences[action.meta.address].payload.available ||
        action.payload.userId === presences[action.meta.address].payload.userId,
    ),
    // deduplicate updates
    filter(
      ([action, { presences }]) =>
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
