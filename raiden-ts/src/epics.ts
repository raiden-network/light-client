import { Observable, from, of, combineLatest, using, timer, defer, EMPTY, concat } from 'rxjs';
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
  switchMap,
  exhaustMap,
  mapTo,
  endWith,
  shareReplay,
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
import constant from 'lodash/constant';

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

import * as DatabaseEpics from './db/epics';
import * as ChannelsEpics from './channels/epics';
import * as TransportEpics from './transport/epics';
import * as TransfersEpics from './transfers/epics';
import * as ServicesEpics from './services/epics';

/**
 * Returns a shared observable to calculate average block time every [opts.fetchEach] blocks
 *
 * @param state$ - Observable of RaidenStates, to fetch blockNumber updates
 * @param provider - To fetch historic block info
 * @param opts - Options object
 * @param opts.initialBlockTime - constant for an initial blockTime (at subscription time)
 * @param opts.fetchEach - how often to fetch block data (in blocks)
 * @returns average block time, in milliseconds, from latest [opts.fetchEach] blocks
 */
function getBlockTime$(
  state$: Observable<RaidenState>,
  provider: RaidenEpicDeps['provider'],
  { initialBlockTime, fetchEach }: { initialBlockTime: number; fetchEach: number } = {
    initialBlockTime: 15e3,
    fetchEach: 10,
  },
): Observable<number> {
  type BlockInfo = readonly [blockNumber: number, timestamp: number, blockTime?: number];
  let lastInfo: BlockInfo = [-fetchEach, 0]; // previously fetched block info

  // get block info for a given block number
  const getBlockInfo$ = (blockNumber: number) =>
    defer(async () =>
      provider
        .getBlock(blockNumber)
        .then((block): BlockInfo => [blockNumber, block.timestamp * 1000]),
    );

  return concat(
    // like startWith, but if somehow this gets re-subscribed, uses lastInfo[2] as initialBlockTime
    defer(() => (lastInfo[0] > 0 && lastInfo[2] ? of(lastInfo[2]) : of(initialBlockTime))),
    state$.pipe(
      pluckDistinct('blockNumber'),
      filter((blockNumber) => blockNumber >= lastInfo[0] + fetchEach),
      exhaustMap((blockNumber) => {
        const prevInfo$ =
          lastInfo[0] > 0 ? of(lastInfo) : getBlockInfo$(Math.max(1, blockNumber - fetchEach));
        const curInfo$ = getBlockInfo$(blockNumber);
        return combineLatest([prevInfo$, curInfo$]).pipe(
          map(([prevInfo, curInfo]) => {
            const avgBlockTime = (curInfo[1] - prevInfo[1]) / (curInfo[0] - prevInfo[0]);
            lastInfo = [curInfo[0], curInfo[1], avgBlockTime];
            return avgBlockTime;
          }),
          catchError(constant(EMPTY)), // ignore errors to retry next block
        );
      }),
    ),
  ).pipe(shareReplay(1)); // share observable to reuse subject in case of multiple subscriptions
}

// Observable of truthy if stale (no new blocks for too long, possibly indicating eth node is out
// of sync), falsy otherwise/initially
function getStale$(
  state$: Observable<RaidenState>,
  blockTime$: Observable<number>,
  config: RaidenConfig,
) {
  return state$.pipe(
    pluckDistinct('blockNumber'),
    withLatestFrom(blockTime$),
    // forEach block
    map(([, blockTime]) => Math.max(3 * blockTime, 2 * config.httpTimeout)),
    startWith(2 * config.httpTimeout), // ensure it works even before state$ emit first
    // switchMap will "reset" timer every block, restarting the timeout
    switchMap((staleTimeout) =>
      concat(
        of(false),
        timer(staleTimeout).pipe(
          mapTo(true),
          // ensure timer completes output if input completes,
          // but first element of concat ensures it'll emit at least once (true) when subscribed
          takeUntil(state$.pipe(ignoreElements(), endWith(null))),
        ),
      ),
    ),
    distinctUntilChanged(),
  );
}

// default value for config.caps[Capabilities.RECEIVE], when it's not user-set
function defaultCapReceive(
  stale: boolean,
  udcBalance: UInt<32>,
  { monitoringReward }: Pick<RaidenConfig, 'monitoringReward'>,
): number {
  return !stale && monitoringReward?.gt(0) && monitoringReward.lte(udcBalance) ? 1 : 0;
}

// calculate dynamic config, based on default, user and udcBalance (for receiving caps)
function getConfig$(
  defaultConfig: RaidenConfig,
  state$: Observable<RaidenState>,
  {
    udcBalance$,
    blockTime$,
  }: { udcBalance$: Observable<UInt<32>>; blockTime$: Observable<number> },
): Observable<RaidenConfig> {
  return state$.pipe(
    pluckDistinct('config'),
    switchMap((userConfig) => {
      const config: Mutable<RaidenConfig> = { ...defaultConfig, ...userConfig };
      // merge default & user caps
      if (config.caps !== null) config.caps = { ...defaultConfig.caps, ...userConfig.caps };
      if (config.caps === null || config.caps[Capabilities.RECEIVE] != null) return of(config);
      // if user config caps is not disabled, calculate dynamic default values
      else
        return combineLatest([udcBalance$, getStale$(state$, blockTime$, config)]).pipe(
          map(([udcBalance, stale]) => ({
            ...config,
            caps: {
              [Capabilities.RECEIVE]: defaultCapReceive(stale, udcBalance, config),
              ...config.caps,
            },
          })),
        );
    }),
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
    distinctUntilChanged((a, b) => a.eq(b)),
  );
  const blockTime$ = getBlockTime$(state$, provider);
  const config$ = getConfig$(defaultConfig, state$, { udcBalance$, blockTime$ });
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
        combineLatest([udcBalance$, blockTime$]),
      ]).pipe(
        map(([[action, state, config, presences, pfsList, rtc], [udcBalance, blockTime]]) => ({
          action,
          state,
          config,
          presences,
          pfsList,
          rtc,
          udcBalance,
          blockTime,
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
