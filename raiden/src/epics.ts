import { Observable, from, of } from 'rxjs';
import { catchError, filter, mergeMap, takeWhile, takeUntil } from 'rxjs/operators';
import { isActionOf } from 'typesafe-actions';
import { negate } from 'lodash';

import { RaidenEpicDeps } from './types';
import { RaidenAction } from './actions';
import { RaidenState } from './store/state';
import { raidenShutdown } from './store/actions';

import * as StoreEpics from './store/epics';
import * as ChannelsEpics from './channels/epics';
import * as TransportEpics from './transport/epics';
import * as TransfersEpics from './transfers/epics';

export const RaidenEpics = {
  ...StoreEpics,
  ...ChannelsEpics,
  ...TransportEpics,
  ...TransfersEpics,
};

export const raidenRootEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<RaidenAction> => {
  const shutdownNotification = action$.pipe(filter(isActionOf(raidenShutdown))),
    limitedAction$ = action$.pipe(
      takeWhile<RaidenAction>(negate(isActionOf(raidenShutdown)), true),
    ),
    limitedState$ = state$.pipe(takeUntil(shutdownNotification));
  // like combineEpics, but completes action$, state$ & output$ when a raidenShutdown goes through
  return from(Object.values(RaidenEpics)).pipe(
    mergeMap(epic => epic(limitedAction$, limitedState$, deps)),
    catchError(err => of(raidenShutdown({ reason: err }))),
    takeUntil(shutdownNotification),
  );
};
