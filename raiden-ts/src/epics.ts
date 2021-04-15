import { MaxUint256 } from '@ethersproject/constants';
import unset from 'lodash/fp/unset';
import isEqual from 'lodash/isEqual';
import negate from 'lodash/negate';
import type { Observable } from 'rxjs';
import { combineLatest, concat, from, merge, of, timer, using } from 'rxjs';
import {
  catchError,
  delayWhen,
  distinctUntilChanged,
  filter,
  finalize,
  first,
  ignoreElements,
  map,
  mergeMap,
  pluck,
  scan,
  startWith,
  take,
  takeUntil,
  takeWhile,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from './actions';
import { raidenConfigCaps, raidenShutdown } from './actions';
import { blockStale, blockTime } from './channels/actions';
import * as ChannelsEpics from './channels/epics';
import type { RaidenConfig } from './config';
import { Capabilities } from './constants';
import * as DatabaseEpics from './db/epics';
import { udcDeposit } from './services/actions';
import * as ServicesEpics from './services/epics';
import type { RaidenState } from './state';
import * as TransfersEpics from './transfers/epics';
import { rtcChannel } from './transport/actions';
import * as TransportEpics from './transport/epics';
import type { Caps } from './transport/types';
import { getPresences$ } from './transport/utils';
import type { Latest, RaidenEpicDeps } from './types';
import { completeWith, pluckDistinct } from './utils/rx';
import type { UInt } from './utils/types';

// default values for dynamic capabilities not specified on defaultConfig nor userConfig
function dynamicCaps({
  stale,
  udcDeposit,
  config: { monitoringReward },
}: Pick<Latest, 'stale' | 'udcDeposit'> & {
  config: Pick<RaidenConfig, 'monitoringReward'>;
}): Caps {
  return {
    [Capabilities.RECEIVE]:
      !stale && monitoringReward?.gt(0) && monitoringReward.lte(udcDeposit.balance) ? 1 : 0,
    [Capabilities.WEBRTC]: 'RTCPeerConnection' in globalThis ? 1 : 0,
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
 * @param deps.mediationFeeCalculator - Calculator used to decode/validate config.mediationFees
 * @returns latest$ observable
 */
export function getLatest$(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  // do not use latest$ or dependents (e.g. config$), as they're defined here
  {
    defaultConfig,
    mediationFeeCalculator,
  }: Pick<RaidenEpicDeps, 'defaultConfig' | 'mediationFeeCalculator'>,
): Observable<Latest> {
  const initialUdcDeposit = {
    balance: MaxUint256 as UInt<32>,
    totalDeposit: MaxUint256 as UInt<32>,
  };
  const initialStale = false;
  const udcDeposit$ = action$.pipe(
    filter(udcDeposit.success.is),
    map((action) => ({ balance: action.payload.balance, totalDeposit: action.meta.totalDeposit })),
    // starts with max, to prevent receiving starting as disabled before actual balance is fetched
    startWith(initialUdcDeposit),
    distinctUntilChanged(({ balance: a }, { balance: b }) => a.eq(b)),
  );
  const blockTime$ = action$.pipe(
    filter(blockTime.is),
    pluck('payload', 'blockTime'),
    startWith(15e3), // default initial blockTime of 15s
  );
  const stale$ = action$.pipe(
    filter(blockStale.is),
    pluck('payload', 'stale'),
    startWith(initialStale),
  );
  const caps$ = merge(
    state$.pipe(
      take(1), // initial caps depends on first state$ emit (initial)
      pluck('config'),
      map(({ caps: userCaps, monitoringReward }) =>
        mergeCaps(
          dynamicCaps({
            udcDeposit: initialUdcDeposit,
            stale: initialStale,
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
    map(([userConfig, caps]) => ({
      ...defaultConfig,
      ...userConfig,
      caps,
      mediationFees: mediationFeeCalculator.decodeConfig(
        userConfig.mediationFees,
        defaultConfig.mediationFees,
      ),
    })),
  );
  const presences$ = getPresences$(action$);
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
    combineLatest([action$, state$, config$, presences$, rtc$]),
    combineLatest([udcDeposit$, blockTime$, stale$]),
  ]).pipe(
    map(([[action, state, config, presences, rtc], [udcDeposit, blockTime, stale]]) => ({
      action,
      state,
      config,
      presences,
      rtc,
      udcDeposit,
      blockTime,
      stale,
    })),
  );
}

const raidenEpics = {
  ...ConfigEpics,
  ...DatabaseEpics,
  ...ChannelsEpics,
  ...TransportEpics,
  ...TransfersEpics,
  ...ServicesEpics,
};

type RaidenEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
) => Observable<RaidenAction>;

/**
 * Consumes epics from epics$ and returns a root epic which properly wraps deps.latest$ and
 * limits action$ and state$ when raidenShutdown request goes through
 *
 * @param epics$ - Observable of raiden epics to compose the root epic
 * @returns The rootEpic which properly wires latest$ and limits action$ & state$
 */
export function combineRaidenEpics(
  epics$: Observable<RaidenEpic> = from(Object.values(raidenEpics)),
): RaidenEpic {
  /**
   * @param action$ - Observable of RaidenActions
   * @param state$ - Observable of RaidenStates
   * @param deps - Epics dependencies
   * @returns Raiden root epic observable
   */
  return function raidenRootEpic(
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
        const output$ = epics$.pipe(
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
  };
}
