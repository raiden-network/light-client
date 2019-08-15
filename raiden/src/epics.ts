import { Observable, from, of } from 'rxjs';
import { catchError, filter, mergeMap, takeWhile, takeUntil } from 'rxjs/operators';
import { isActionOf } from 'typesafe-actions';
import { negate } from 'lodash';

import { RaidenState } from './state';
import { RaidenEpicDeps } from './types';
import { RaidenAction, raidenShutdown } from './actions';

import * as ChannelsEpics from './channels/epics';
import * as TransportEpics from './transport/epics';
import * as TransfersEpics from './transfers/epics';

export const RaidenEpics = {
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

  // wire state$ & action$ to output subjects, to expose them to Raiden public class
  limitedState$.subscribe(deps.stateOutput$);
  limitedAction$.subscribe(deps.actionOutput$);

  // like combineEpics, but completes action$, state$ & output$ when a raidenShutdown goes through
  return from(Object.values(RaidenEpics)).pipe(
    mergeMap(epic => epic(limitedAction$, limitedState$, deps)),
    catchError(err => of(raidenShutdown({ reason: err }))),
    takeUntil(shutdownNotification),
  );
};
