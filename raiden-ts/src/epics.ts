import { Observable, from, of, combineLatest, using, throwError } from 'rxjs';
import {
  catchError,
  filter,
  mergeMap,
  takeWhile,
  takeUntil,
  pluck,
  startWith,
  map,
  scan,
  distinctUntilChanged,
} from 'rxjs/operators';
import { MaxUint256 } from '@ethersproject/constants';
import negate from 'lodash/negate';
import unset from 'lodash/fp/unset';
import isEqual from 'lodash/isEqual';

import { RaidenState } from './state';
import { RaidenEpicDeps, Latest } from './types';
import { RaidenAction, raidenShutdown } from './actions';
import { RaidenConfig } from './config';
import { Capabilities } from './constants';
import { pluckDistinct } from './utils/rx';
import { getPresences$ } from './transport/utils';
import { rtcChannel } from './transport/actions';
import { pfsListUpdated, udcDeposit } from './services/actions';
import { Address, UInt } from './utils/types';
import { isActionOf } from './utils/actions';

import * as DatabaseEpics from './db/epics';
import * as ChannelsEpics from './channels/epics';
import * as TransportEpics from './transport/epics';
import * as TransfersEpics from './transfers/epics';
import * as ServicesEpics from './services/epics';

// calculate dynamic config, based on default, user and udcBalance (for receiving caps)
function getConfig$(
  defaultConfig: RaidenConfig,
  state$: Observable<RaidenState>,
  udcBalance$: Observable<UInt<32>>,
): Observable<RaidenConfig> {
  const partialConfig$ = state$.pipe(pluckDistinct('config'));
  return combineLatest([partialConfig$, udcBalance$]).pipe(
    map(
      ([userConfig, udcBalance]): RaidenConfig => {
        const config: Mutable<RaidenConfig> = { ...defaultConfig, ...userConfig };
        // if user config caps is not disabled, calculate dynamic default values
        if (config.caps !== null)
          config.caps = {
            [Capabilities.RECEIVE]:
              config.monitoringReward?.gt(0) && config.monitoringReward.lte(udcBalance) ? 1 : 0,
            ...defaultConfig.caps,
            ...userConfig.caps,
          };
        return config;
      },
    ),
    distinctUntilChanged(isEqual),
  );
}

/**
 * This function maps cached/latest relevant values from action$ & state$
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies, minus 'latest$' & 'config$' (outputs)
 * @param deps.defaultConfig - defaultConfig mapping
 * @param deps.log - Logger instance
 * @param deps.provider - Provider instance
 * @returns latest$ observable
 */
export function getLatest$(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  // do not use latest$ or dependents (e.g. config$), as they're defined here
  { defaultConfig, log, provider }: Pick<RaidenEpicDeps, 'defaultConfig' | 'log' | 'provider'>,
): Observable<Latest> {
  const udcBalance$ = action$.pipe(
    filter(udcDeposit.success.is),
    pluck('payload', 'balance'),
    // starts with max, to prevent receiving starting as disabled before actual balance is fetched
    startWith(MaxUint256 as UInt<32>),
  );
  const config$ = getConfig$(defaultConfig, state$, udcBalance$);
  const presences$ = getPresences$(action$);
  const pfsList$ = action$.pipe(
    filter(pfsListUpdated.is),
    pluck('payload', 'pfsList'),
    startWith([] as readonly Address[]),
  );
  const rtc$ = action$.pipe(
    filter(rtcChannel.is),
    // scan: if v.payload is defined, set it; else, unset
    scan(
      (acc, v) =>
        v.payload ? { ...acc, [v.meta.address]: v.payload } : unset(v.meta.address, acc),
      {} as Latest['rtc'],
    ),
    startWith({} as Latest['rtc']),
  );

  return using(
    // using will ensure these subscriptions only happen at output's subscription time
    // and are properly teared down upon output's unsubscribe, complete or error
    // subscription.add will add child subscriptions to teardown when parent does
    () => {
      const sub = config$
        .pipe(pluckDistinct('logger'))
        .subscribe((logger) => log.setLevel(logger || 'silent', false));
      sub.add(
        config$
          .pipe(pluckDistinct('pollingInterval'))
          .subscribe((pollingInterval) => (provider.pollingInterval = pollingInterval)),
      );
      return sub;
    },
    () =>
      // the nested combineLatest is needed because it can only infer the type of 6 params
      combineLatest([
        combineLatest([action$, state$, config$, presences$, pfsList$, rtc$]),
        combineLatest([udcBalance$]),
      ]).pipe(
        map(([[action, state, config, presences, pfsList, rtc], [udcBalance]]) => ({
          action,
          state,
          config,
          presences,
          pfsList,
          rtc,
          udcBalance,
        })),
      ),
  );
}

const RaidenEpics = {
  ...DatabaseEpics,
  ...ChannelsEpics,
  ...TransportEpics,
  ...TransfersEpics,
  ...ServicesEpics,
};

/**
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @returns Raiden root epic observable
 */
export function raidenRootEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<RaidenAction> {
  // observable which emits once when a raidenShutdown action goes through actions pipeline
  const shutdownNotification = action$.pipe(filter(isActionOf(raidenShutdown))),
    // actions pipeline, but ends with (including) a raidenShutdown action
    limitedAction$ = action$.pipe(
      takeWhile<RaidenAction>(negate(isActionOf(raidenShutdown)), true),
    ),
    // states pipeline, but ends when shutdownNotification emits
    limitedState$ = state$.pipe(takeUntil(shutdownNotification));

  return using(
    // wire deps.latest$ when observableFactory below gets subscribed, and tears down on complete
    () => getLatest$(limitedAction$, limitedState$, deps).subscribe(deps.latest$),
    () =>
      // like combineEpics, but completes action$, state$ & output$ when a raidenShutdown goes through
      from(Object.values(RaidenEpics)).pipe(
        mergeMap((epic) =>
          epic(limitedAction$, limitedState$, deps).pipe(
            catchError((err) => {
              deps.log.error('Epic error', epic.name, epic, err);
              return throwError(err);
            }),
          ),
        ),
        catchError((err) => of(raidenShutdown({ reason: err }))),
        takeUntil(shutdownNotification),
      ),
  );
}
