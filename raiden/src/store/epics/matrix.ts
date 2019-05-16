import { ofType } from 'redux-observable';
import { Observable, from, of, EMPTY, fromEvent } from 'rxjs';
import {
  catchError,
  filter,
  map,
  mergeMap,
  withLatestFrom,
  scan,
  startWith,
  switchMap,
  tap,
  toArray,
} from 'rxjs/operators';
import { minBy } from 'lodash';

import { getAddress, verifyMessage } from 'ethers/utils';
import { MatrixEvent, User } from 'matrix-js-sdk';

import { RaidenEpicDeps } from '../../types';
import { RaidenState } from '../state';
import { getUserPresence } from '../../utils';
import {
  RaidenActionType,
  RaidenActions,
  MatrixRequestMonitorPresenceAction,
  MatrixRequestMonitorPresenceActionFailed,
  MatrixPresenceUpdateAction,
  matrixPresenceUpdate,
  matrixRequestMonitorPresenceFailed,
} from '../actions';

interface Presences {
  [address: string]: MatrixPresenceUpdateAction;
}

/**
 * Helper to map/get an aggregated Presences observable from action$ bus
 * Known presences as { address: <last seen MatrixPresenceUpdateAction> } mapping
 * @param action$ Observable
 * @returns Observable of aggregated Presences from subscription to now
 */
const getPresences$ = (action$: Observable<RaidenActions>): Observable<Presences> =>
  action$.pipe(
    ofType<RaidenActions, MatrixPresenceUpdateAction>(RaidenActionType.MATRIX_PRESENCE_UPDATE),
    scan(
      // scan all presence update actions and populate/output a per-address mapping
      (presences: Presences, update: MatrixPresenceUpdateAction) => ({
        ...presences,
        [update.address]: update,
      }),
      {},
    ),
    startWith<Presences>({}),
  );

// unavailable just means the user didn't do anything over a certain amount of time, but they're
// still there, so we consider the user as available then
const AVAILABLE = ['online', 'unavailable'];
const userRe = /^@(0x[0-9a-f]{40})[.:]/i;

/**
 * Handles MatrixRequestMonitorPresenceAction and emits a MatrixPresenceUpdateAction
 * If presence is already known, emits it, else fetch from user profile
 * Even if the presence stays the same, we emit a MatrixPresenceUpdateAction, as this may be a
 * request being waited by a promise or something like that
 * IOW: every request should be followed by a presence update or a failed action, but presence
 * updates may happen later without new requests (e.g. when the user goes offline)
 */
export const matrixMonitorPresenceEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<MatrixPresenceUpdateAction | MatrixRequestMonitorPresenceActionFailed> =>
  action$.pipe(
    ofType<RaidenActions, MatrixRequestMonitorPresenceAction>(
      RaidenActionType.MATRIX_REQUEST_MONITOR_PRESENCE,
    ),
    // this mergeMap is like withLatestFrom, but waits until matrix$ emits its only value
    mergeMap(action => matrix$.pipe(map(matrix => ({ action, matrix })))),
    withLatestFrom(getPresences$(action$)),
    mergeMap(([{ action, matrix }, presences]) => {
      if (action.address in presences)
        // we already monitored/saw this user's presence
        return of(presences[action.address]);

      const validUsers: User[] = [];
      for (const user of matrix.getUsers()) {
        if (!user.userId.includes(action.address.toLowerCase())) continue;
        if (!user.displayName) continue;
        if (!user.presence) continue;
        let recovered: string;
        try {
          const match = userRe.exec(user.userId);
          if (!match || getAddress(match[1]) !== action.address) continue;
          recovered = verifyMessage(user.userId, user.displayName);
          if (!recovered || recovered !== action.address) continue;
        } catch (err) {
          continue;
        }
        validUsers.push(user);
      }
      // IFF we see a cached/stored user (matrix.getUsers), with displayName and presence already
      // populated, which displayName signature verifies to our address of interest,
      // then construct and return the MatrixPresenceUpdateAction from the stored data
      if (validUsers.length > 0) {
        const user = minBy(validUsers, 'lastPresenceTs')!;
        return of(
          matrixPresenceUpdate(action.address, user.userId, AVAILABLE.includes(user.presence!)),
        );
      }

      // if anything failed up to here, go the slow path: searchUserDirectory + getUserPresence
      return from(
        // search user directory for any user containing the address of interest in its userId
        matrix.searchUserDirectory({ term: action.address.toLowerCase() }),
      ).pipe(
        // for every result matches, verify displayName signature is address of interest
        map(({ results }) => {
          const validUsers: string[] = [];
          for (const user of results) {
            if (!user.display_name) continue;
            try {
              const match = userRe.exec(user.user_id);
              if (!match || getAddress(match[1]) !== action.address) continue;
              const recovered = verifyMessage(user.user_id, user.display_name);
              if (!recovered || recovered !== action.address) continue;
            } catch (err) {
              continue;
            }
            validUsers.push(user.user_id);
          }
          if (validUsers.length === 0)
            // if no valid user could be found, throw an error to be handled below
            throw new Error(
              `Could not find any user with valid signature for ${action.address} in ${results}`,
            );
          else return validUsers;
        }),
        mergeMap(userIds => from(userIds)),
        mergeMap(userId =>
          getUserPresence(matrix, userId).then(presence =>
            // eslint-disable-next-line @typescript-eslint/camelcase
            Object.assign(presence, { user_id: userId }),
          ),
        ),
        toArray(),
        // for all matched/verified users, get its presence through dedicated API
        // it's required because, as the user events could already have been handled and
        // filtered out by matrixPresenceUpdateEpic because it wasn't yet a user-of-interest,
        // we could have missed presence updates, then we need to fetch it here directly,
        // and from now on, that other epic will monitor its updates, and sort by most recently
        // seen user
        map(presences => minBy(presences, 'last_active_ago')!),
        map(({ presence, user_id: userId }) =>
          matrixPresenceUpdate(action.address, userId, AVAILABLE.includes(presence)),
        ),
        catchError(err => of(matrixRequestMonitorPresenceFailed(action.address, err))),
      );
    }),
  );

/**
 * Monitor peers matrix presence from User.presence events
 * We aggregate all users of interest (i.e. for which a monitor request was emitted at some point)
 * and emit presence updates for any presence change happening to a user validating to this address
 */
export const matrixPresenceUpdateEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<MatrixPresenceUpdateAction> =>
  matrix$.pipe(
    tap(matrix => console.warn('MATRIX', matrix)),
    // when matrix finishes initialization, register to matrix presence events
    switchMap(matrix =>
      // matrix's 'User.presence' sometimes fail to fire, but generic 'event' is always fired,
      // and User (retrieved via matrix.getUser) is up-to-date before 'event' emits
      fromEvent<MatrixEvent>(matrix, 'event').pipe(map(event => ({ event, matrix }))),
    ),
    filter(({ event }) => event.getType() === 'm.presence'),
    // parse peer address from userId
    map(({ event, matrix }) => {
      // as 'event' is emitted after user is (created and) updated, getUser always returns it
      const user = matrix.getUser(event.getSender())!,
        match = userRe.exec(user.userId),
        peerAddress = match && match[1];
      // getAddress will convert any valid address into checksummed-format
      return { user, matrix, peerAddress: peerAddress && getAddress(peerAddress) };
    }),
    // filter out events without userId in the right format (startWith hex-address)
    filter(({ user, peerAddress }) => !!(user.presence && peerAddress)),
    withLatestFrom(
      // observable of all addresses whose presence monitoring was requested since init
      action$.pipe(
        ofType<RaidenActions, MatrixRequestMonitorPresenceAction>(
          RaidenActionType.MATRIX_REQUEST_MONITOR_PRESENCE,
        ),
        scan(
          (toMonitor: Set<string>, request: MatrixRequestMonitorPresenceAction) =>
            toMonitor.add(request.address),
          new Set<string>(),
        ),
        startWith(new Set<string>()),
      ),
      // known presences as { address: <last seen MatrixPresenceUpdateAction> } mapping
      getPresences$(action$),
    ),
    // filter out events from users we don't care about
    // i.e.: presence monitoring never requested
    filter(([{ peerAddress }, toMonitor]) => toMonitor.has(peerAddress!)),
    mergeMap(([{ user, matrix, peerAddress }, , presences]) => {
      // first filter can't tell typescript this property will always be set!
      const userId = user.userId,
        address = peerAddress!,
        presence = user.presence!,
        available = AVAILABLE.includes(presence);

      if (
        address in presences &&
        presences[address].userId === userId &&
        presences[address].available === available
      )
        // even if signature verification passes, this wouldn't change presence, so return early
        return EMPTY;

      // fetch profile info if user doesn't contain a displayName
      const displayName$: Observable<string | undefined> = user.displayName
        ? of(user.displayName)
        : from(matrix.getProfileInfo(userId, 'displayname')).pipe(
            map(profile => profile.displayname),
            catchError(() => of(undefined)),
          );

      return displayName$.pipe(
        map(displayName => {
          // errors raised here will be logged and ignored on catchError below
          if (!displayName) throw new Error(`Could not get displayName of "${userId}"`);
          // ecrecover address, validating displayName is the signature of the userId
          const recovered = verifyMessage(userId, displayName);
          if (!recovered || recovered !== peerAddress)
            throw new Error(
              `Could not verify displayName signature of "${userId}": got "${recovered}"`,
            );
          return recovered;
        }),
        map(address => matrixPresenceUpdate(address, userId, available, user.lastPresenceTs)),
      );
    }),
    catchError(err => (console.log('Error validating presence event, ignoring', err), EMPTY)),
  );
