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
} from 'rxjs/operators';

import { getAddress, verifyMessage } from 'ethers/utils';
import { MatrixClient, Event, User } from 'matrix-js-sdk';

import { RaidenEpicDeps } from '../../types';
import { RaidenState } from '../state';
import {
  RaidenActionType,
  RaidenActions,
  MatrixRequestMonitorPresenceAction,
  // MatrixRequestMonitorPresenceActionFailed,
  MatrixPresenceUpdateAction,
  matrixPresenceUpdate,
} from '../actions';

interface Presences {
  [address: string]: MatrixPresenceUpdateAction;
}

/**
 * Helper to map/get an aggregated Presences observable from action$ bus
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

const AVAILABLE = ['online', 'unavailable'];

/**
 * Monitor peers matrix presence from User.presence events
 */
export const matrixPresenceUpdateEpic = (
  action$: Observable<RaidenActions>,
  state$: Observable<RaidenState>,
  { matrix$ }: RaidenEpicDeps,
): Observable<MatrixPresenceUpdateAction> =>
  matrix$.pipe(
    // when matrix finishes initialization, register to matrix presence events
    switchMap(matrix =>
      fromEvent<{ event: Event; user: User; matrix: MatrixClient }>(
        matrix,
        'User.presence',
        (event, user) => ({ event, user, matrix }),
      ),
    ),
    // parse peer address from userId
    map(({ event, user, matrix }) => {
      const userId: string = event.sender || user.userId,
        match = /^@(0x[0-9a-f]{40})[.:]/i.exec(userId),
        peerAddress = match && match[1];
      // getAddress will convert any valid address into checksummed-format
      return { event, user, matrix, userId, peerAddress: peerAddress && getAddress(peerAddress) };
    }),
    // filter out events without userId in the right format (startWith hex-address)
    filter(({ userId, peerAddress }) => !!(userId && peerAddress)),
    withLatestFrom(
      // observable of all users whose presence monitoring was requested since init
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
      // known presences as { address: { userId, available } } mapping
      getPresences$(action$),
    ),
    // filter out events from users we don't care about
    // i.e.: presence monitoring never requested
    filter(([{ peerAddress }, toMonitor]) => toMonitor.has(peerAddress!)),
    mergeMap(([{ event, user, matrix, userId, peerAddress }, , presences]) => {
      // first filter can't tell typescript this property will always be set!
      const address = peerAddress!,
        presence = event.content.presence || user.presence,
        available = AVAILABLE.includes(presence);

      if (
        address in presences &&
        presences[address].userId === userId &&
        presences[address].available === available
      )
        // even if signature verification passes, this wouldn't change presence, so return early
        return EMPTY;

      // fetch profile info if event or user doesn't contain a displayName
      const displayName$: Observable<string | undefined> = event.content.displayname
        ? of(event.content.displayname)
        : user.displayName
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
        map(address => matrixPresenceUpdate(address, userId, available)),
      );
    }),
    catchError(err => (console.log('Error validating presence event, ignoring', err), EMPTY)),
  );
