import { Observable, from, of, combineLatest, using, timer, concat, merge } from 'rxjs';
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
  ignoreElements,
  withLatestFrom,
  delayWhen,
  take,
  first,
  tap,
  finalize,
} from 'rxjs/operators';
import { MaxUint256 } from '@ethersproject/constants';
import negate from 'lodash/negate';
import unset from 'lodash/fp/unset';
import isEqual from 'lodash/isEqual';

import { RaidenState } from './state';
import { RaidenEpicDeps, Latest } from './types';
import { RaidenAction, raidenConfigCaps, raidenShutdown } from './actions';
import { RaidenConfig } from './config';
import { Capabilities } from './constants';
import { completeWith, pluckDistinct } from './utils/rx';
import { getPresences$ } from './transport/utils';
import { rtcChannel } from './transport/actions';
import { pfsListUpdated, udcDeposit } from './services/actions';
import { Address, UInt } from './utils/types';

import * as DatabaseEpics from './db/epics';
import * as ChannelsEpics from './channels/epics';
import * as TransportEpics from './transport/epics';
import * as TransfersEpics from './transfers/epics';
import * as ServicesEpics from './services/epics';
import { blockStale, blockTime } from './channels/actions';
import { Caps } from './transport/types';

// default values for dynamic capabilities not specified on defaultConfig nor userConfig
function dynamicCaps({
  stale,
  udcBalance,
  config: { monitoringReward },
}: Pick<Latest, 'stale' | 'udcBalance'> & {
  config: Pick<RaidenConfig, 'monitoringReward'>;
}): Caps {
  return {
    [Capabilities.RECEIVE]:
      !stale && monitoringReward?.gt(0) && monitoringReward.lte(udcBalance) ? 1 : 0,
  };
}

function mergeCaps(
  dynamicCaps: Caps,
  defaultCaps: Caps | null,
  userCaps?: Caps | null,
): Caps | null {
  // if userCaps is disabled, disables everything
  if (userCaps === null) return userCaps;
  // if userCaps is an object, merge all caps
  else if (userCaps !== undefined) return { ...dynamicCaps, ...defaultCaps, ...userCaps };
  // if userCaps isn't set and defaultCaps is null, disables everything
  else if (defaultCaps === null) return defaultCaps;
  // if userCaps isn't set and defaultCaps is an object, merge it with dynamicCaps
  else return { ...dynamicCaps, ...defaultCaps };
}

/**
 * Aggregate dynamic (runtime-values dependent), default and user capabilities and emit
 * raidenConfigCaps actions when it changes
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.defaultConfig - Default config object
 * @param deps.latest$ - latest observable
 * @returns Observable of raidenConfigCaps actions
 */
function configCapsEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { defaultConfig, latest$ }: RaidenEpicDeps,
): Observable<raidenConfigCaps> {
  return combineLatest([state$.pipe(pluckDistinct('config', 'caps')), latest$]).pipe(
    map(([userCaps, latest]) => mergeCaps(dynamicCaps(latest), defaultConfig.caps, userCaps)),
    distinctUntilChanged<Caps | null>(isEqual),
    map((caps) => raidenConfigCaps({ caps })),
    completeWith(state$),
  );
}

/**
 * React on certain config property changes and act accordingly:
 * Currently, reflect config.logger on deps.log's level, and config.pollingInterval on provider's
 * pollingInterval.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.config$ - Config observable
 * @param deps.log - Logger instance
 * @param deps.provider - Provider instance
 * @returns Observable which never emits
 */
function configReactEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { config$, log, provider }: RaidenEpicDeps,
): Observable<never> {
  return merge(
    config$.pipe(
      pluckDistinct('logger'),
      tap((level) => log.setLevel(level || 'silent', false)),
    ),
    config$.pipe(
      pluckDistinct('pollingInterval'),
      tap((pollingInterval) => (provider.pollingInterval = pollingInterval)),
    ),
  ).pipe(ignoreElements(), completeWith(action$));
}

const ConfigEpics = { configCapsEpic, configReactEpic };

/**
 * This function maps cached/latest relevant values from action$ & state$
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies, minus 'latest$' & 'config$' (outputs)
 * @param deps.defaultConfig - defaultConfig mapping
 * @returns latest$ observable
 */
export function getLatest$(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  // do not use latest$ or dependents (e.g. config$), as they're defined here
  { defaultConfig }: Pick<RaidenEpicDeps, 'defaultConfig'>,
): Observable<Latest> {
  const initialUdcBalance = MaxUint256 as UInt<32>;
  const iniitialStale = false;
  const udcBalance$ = action$.pipe(
    filter(udcDeposit.success.is),
    pluck('payload', 'balance'),
    // starts with max, to prevent receiving starting as disabled before actual balance is fetched
    startWith(initialUdcBalance),
    distinctUntilChanged((a, b) => a.eq(b)),
  );
  const blockTime$ = action$.pipe(
    filter(blockTime.is),
    pluck('payload', 'blockTime'),
    startWith(15e3), // default initial blockTime of 15s
  );
  const stale$ = action$.pipe(
    filter(blockStale.is),
    pluck('payload', 'stale'),
    startWith(iniitialStale),
  );
  const caps$ = merge(
    state$.pipe(
      take(1), // initial caps depends on first state$ emit (initial)
      pluck('config'),
      map(({ caps: userCaps, monitoringReward }) =>
        mergeCaps(
          dynamicCaps({
            udcBalance: initialUdcBalance,
            stale: iniitialStale,
            config: { monitoringReward: monitoringReward ?? defaultConfig.monitoringReward },
          }),
          defaultConfig.caps,
          userCaps,
        ),
      ),
    ),
    // after that, pick from raidenConfigCaps actions
    action$.pipe(filter(raidenConfigCaps.is), pluck('payload', 'caps')),
  );
  const config$ = combineLatest([state$.pipe(pluckDistinct('config')), caps$]).pipe(
    map(([userConfig, caps]) => ({ ...defaultConfig, ...userConfig, caps })),
  );
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

  return combineLatest([
    combineLatest([action$, state$, config$, presences$, pfsList$, rtc$]),
    combineLatest([udcBalance$, blockTime$, stale$]),
  ]).pipe(
    map(([[action, state, config, presences, pfsList, rtc], [udcBalance, blockTime, stale]]) => ({
      action,
      state,
      config,
      presences,
      pfsList,
      rtc,
      udcBalance,
      blockTime,
      stale,
    })),
  );
}

const RaidenEpics = {
  ...ConfigEpics,
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
  const shutdownNotification = action$.pipe(filter(raidenShutdown.is), take(1)),
    // actions pipeline, but ends with (including) a raidenShutdown action
    limitedAction$ = action$.pipe(takeWhile<RaidenAction>(negate(raidenShutdown.is), true)),
    // states pipeline, but ends when shutdownNotification emits
    limitedState$ = state$.pipe(takeUntil(shutdownNotification));

  // like combineEpics, but completes action$, state$ & output$ when a raidenShutdown goes through;
  return using(
    // wire deps.latest$ when observableFactory below gets subscribed, and tears down on complete
    () => {
      const sub = getLatest$(action$, state$, deps).subscribe(deps.latest$);
      // ensure deps.latest$ is completed if teardown happens before getLatest$ completion
      sub.add(() => deps.latest$.complete());
      return sub;
    },
    () => {
      const subscribedEpics = new Set<string>();
      // main epics output
      const output$ = from(Object.values(RaidenEpics)).pipe(
        mergeMap((epic) => {
          subscribedEpics.add(epic.name);
          return epic(limitedAction$, limitedState$, deps).pipe(
            catchError((err) => {
              deps.log.error('Epic error', epic.name, epic, err);
              return of(raidenShutdown({ reason: err }));
            }),
            finalize(() => subscribedEpics.delete(epic.name)),
          );
        }),
        takeUntil(
          shutdownNotification.pipe(
            withLatestFrom(deps.config$),
            // give up to httpTimeout for the epics to complete on their own
            delayWhen(([_, { httpTimeout }]) => timer(httpTimeout)),
            tap(() => deps.log.warn('Pending Epics :', subscribedEpics)),
          ),
        ),
      );
      // also concat db teardown tasks, to be done after main epic completes
      const teardown$ = deps.db.busy$.pipe(
        first((busy) => !busy),
        tap(() => deps.db.busy$.next(true)),
        // ignore db.busy$ errors, they're merged in the output by dbErrorsEpic
        catchError(() => of(null)),
        mergeMap(async () => deps.db.close()),
        ignoreElements(),
        finalize(() => {
          deps.db.busy$.next(false);
          deps.db.busy$.complete();
        }),
      );
      // subscribe to teardown$ only after output$ completes
      return concat(output$, teardown$);
    },
  );
}
