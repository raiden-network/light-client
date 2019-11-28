import { Observable, from, of } from 'rxjs';
import {
  catchError,
  filter,
  mergeMap,
  takeWhile,
  takeUntil,
  pluck,
  distinctUntilChanged,
} from 'rxjs/operators';
import { isActionOf } from 'typesafe-actions';
import { negate } from 'lodash';

import { RaidenState } from './state';
import { RaidenEpicDeps } from './types';
import { RaidenAction, raidenShutdown } from './actions';

import * as ChannelsEpics from './channels/epics';
import * as TransportEpics from './transport/epics';
import * as TransfersEpics from './transfers/epics';
import * as PathFindEpics from './path/epics';

export const RaidenEpics = {
  ...ChannelsEpics,
  ...TransportEpics,
  ...TransfersEpics,
  ...PathFindEpics,
};

export const raidenRootEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<RaidenAction> => {
  // observable which emits once when a raidenShutdown action goes through actions pipeline
  const shutdownNotification = action$.pipe(filter(isActionOf(raidenShutdown))),
    // actions pipeline, but ends with (including) a raidenShutdown action
    limitedAction$ = action$.pipe(
      takeWhile<RaidenAction>(negate(isActionOf(raidenShutdown)), true),
    ),
    // states pipeline, but ends when shutdownNotification emits
    limitedState$ = state$.pipe(takeUntil(shutdownNotification));

  // wire state$ & action$ to output subjects, to expose them to Raiden public class,
  // including complete notifications (these observables don't error, because error would end
  // subscriptions at the returned observable instead of feed-backing them)
  limitedState$.subscribe(deps.stateOutput$);
  limitedAction$.subscribe(deps.actionOutput$);

  // wire state.config to deps.config$ BehaviorSubject
  limitedState$.pipe(pluck('config'), distinctUntilChanged()).subscribe(deps.config$);

  // like combineEpics, but completes action$, state$ & output$ when a raidenShutdown goes through
  return from(Object.values(RaidenEpics)).pipe(
    mergeMap(epic => epic(limitedAction$, limitedState$, deps)),
    catchError(err => of(raidenShutdown({ reason: err }))),
    takeUntil(shutdownNotification),
  );
};
