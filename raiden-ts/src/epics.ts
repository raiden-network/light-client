import { Observable, from, of, combineLatest } from 'rxjs';
import {
  catchError,
  filter,
  mergeMap,
  takeWhile,
  takeUntil,
  pluck,
  startWith,
  map,
} from 'rxjs/operators';
import negate from 'lodash/negate';

import { RaidenState } from './state';
import { RaidenEpicDeps } from './types';
import { RaidenAction, raidenShutdown } from './actions';
import { PartialRaidenConfig, RaidenConfig } from './config';
import { pluckDistinct } from './utils/rx';
import { getPresences$ } from './transport/utils';
import { pfsListUpdated } from './path/actions';
import { Address } from './utils/types';
import { isActionOf } from './utils/actions';

import * as ChannelsEpics from './channels/epics';
import * as TransportEpics from './transport/epics';
import * as TransfersEpics from './transfers/epics';
import * as PathFindEpics from './path/epics';

/**
 * This function maps cached/latest relevant values from action$ & state$
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @returns latest$ observable
 */
export function getLatest$(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { defaultConfig }: Pick<RaidenEpicDeps, 'defaultConfig'>,
) {
  return combineLatest([
    action$,
    state$,
    state$.pipe(
      pluckDistinct('config'),
      map((c: PartialRaidenConfig): RaidenConfig => ({ ...defaultConfig, ...c })),
    ),
    getPresences$(action$),
    action$.pipe(
      filter(isActionOf(pfsListUpdated)),
      pluck('payload', 'pfsList'),
      startWith([] as readonly Address[]),
    ),
  ]).pipe(
    map(([action, state, config, presences, pfsList]) => {
      return {
        action,
        state,
        config,
        presences,
        pfsList,
      };
    }),
  );
}

const RaidenEpics = {
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

  // wire deps.latest$
  getLatest$(limitedAction$, limitedState$, deps).subscribe(deps.latest$);

  // like combineEpics, but completes action$, state$ & output$ when a raidenShutdown goes through
  return from(Object.values(RaidenEpics)).pipe(
    mergeMap(epic => epic(limitedAction$, limitedState$, deps)),
    catchError(err => of(raidenShutdown({ reason: err }))),
    takeUntil(shutdownNotification),
  );
};
