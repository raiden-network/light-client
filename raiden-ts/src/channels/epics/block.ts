import constant from 'lodash/constant';
import type { Observable } from 'rxjs';
import { AsyncSubject, combineLatest, concat, defer, EMPTY, from, of, timer } from 'rxjs';
import {
  catchError,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  endWith,
  exhaustMap,
  filter,
  finalize,
  first,
  ignoreElements,
  map,
  mapTo,
  mergeMap,
  pluck,
  scan,
  startWith,
  switchMap,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { ConfirmableAction, RaidenAction } from '../../actions';
import { raidenSynced } from '../../actions';
import { intervalFromConfig } from '../../config';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { fromEthersEvent } from '../../utils/ethers';
import { completeWith, lastMap, pluckDistinct, retryAsync$, retryWhile } from '../../utils/rx';
import { isntNil } from '../../utils/types';
import { blockStale, blockTime, contractSettleTimeout, newBlock } from '../actions';

/**
 * Emits raidenSynced when all init$ tasks got completed
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.init$ - Init$ subject
 * @returns Observable of raidenSynced actions
 */
export function initEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { init$ }: RaidenEpicDeps,
): Observable<raidenSynced> {
  return state$.pipe(
    first(),
    mergeMap(({ blockNumber: initialBlock }) => {
      const startTime = Date.now();
      return init$.pipe(
        mergeMap((subject) => concat(of(1), subject.pipe(ignoreElements(), endWith(-1)))),
        scan((acc, v) => acc + v, 0), // scan doesn't emit initial value
        debounceTime(10), // should be just enough for some sync action
        first((acc) => acc === 0),
        withLatestFrom(state$),
        map(([, { blockNumber }]) =>
          raidenSynced({
            tookMs: Date.now() - startTime,
            initialBlock,
            currentBlock: blockNumber,
          }),
        ),
      );
    }),
    completeWith(state$),
    finalize(() => init$.complete()),
  );
}

/**
 * Fetch current blockNumber, register for new block events and emit newBlock actions
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.provider - Eth provider
 * @param deps.init$ - Observable which completes when initial sync is done
 * @returns Observable of newBlock actions
 */
export function initNewBlockEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { provider, init$ }: RaidenEpicDeps,
): Observable<newBlock> {
  return retryAsync$(() => provider.getBlockNumber(), provider.pollingInterval).pipe(
    // emits fetched block first, then subscribes to provider's block after synced
    mergeMap((blockNumber) =>
      init$.pipe(
        lastMap(() => fromEthersEvent<number>(provider, 'block')),
        startWith(blockNumber),
      ),
    ),
    map((blockNumber) => newBlock({ blockNumber })),
    completeWith(action$),
  );
}

/**
 * Every fetchEach=20 blocks, update average block time since previous request
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.provider - Eth provider
 * @returns Observable of blockTime actions
 */
export function blockTimeEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { provider }: RaidenEpicDeps,
): Observable<blockTime> {
  const fetchEach = 20;
  type BlockInfo = readonly [blockNumber: number, timestamp: number, blockTime?: number];
  let lastInfo: BlockInfo = [-fetchEach, 0]; // previously fetched block info

  // get block info for a given block number
  const getBlockInfo$ = (blockNumber: number) =>
    defer(async () =>
      provider
        .getBlock(blockNumber)
        .then(({ timestamp }): BlockInfo => [blockNumber, timestamp * 1000]),
    );

  return action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    filter((blockNumber) => blockNumber >= lastInfo[0] + fetchEach),
    exhaustMap((blockNumber) => {
      const prevInfo$ =
        lastInfo[0] > 0 ? of(lastInfo) : getBlockInfo$(Math.max(1, blockNumber - fetchEach));
      const curInfo$ = getBlockInfo$(blockNumber);
      return combineLatest([prevInfo$, curInfo$]).pipe(
        mergeMap(function* ([prevInfo, curInfo]) {
          const avgBlockTime = (curInfo[1] - prevInfo[1]) / (curInfo[0] - prevInfo[0]);
          // emit a new avg blockTime only if it changed
          if (avgBlockTime !== lastInfo[2]) yield avgBlockTime;
          lastInfo = [curInfo[0], curInfo[1], avgBlockTime]; // persist last BlockInfo
        }),
        catchError(constant(EMPTY)), // ignore errors to retry next block
      );
    }),
    map((avgBlockTime) => blockTime({ blockTime: avgBlockTime })),
  );
}

/**
 * Monitors provider for staleness. A provider is considered stale when it doesn't emit new blocks
 * on either 2 * httpTimeout or the average time for 3 blocks.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of blockStale actions
 */
export function blockStaleEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { latest$, config$ }: RaidenEpicDeps,
): Observable<blockStale> {
  return state$.pipe(
    pluckDistinct('blockNumber'),
    withLatestFrom(latest$, config$),
    // forEach block
    map(([, { blockTime }, { httpTimeout }]) => Math.max(3 * blockTime, 2 * httpTimeout)),
    // switchMap will "reset" timer every block, restarting the timeout
    switchMap((staleTimeout) =>
      concat(
        of(false),
        timer(staleTimeout).pipe(
          mapTo(true),
          // ensure timer completes output if input completes,
          // but first element of concat ensures it'll emit at least once (true) when subscribed
          completeWith(state$),
        ),
      ),
    ),
    distinctUntilChanged(),
    map((stale) => blockStale({ stale })),
  );
}

/**
 * Fetch settleTimeout from contract once
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.registryContract - TokenNetworkRegistry instance
 * @param deps.config$ - Config observable
 * @param deps.init$ - Observable of sync tasks
 * @returns Observable of contractSettleTimeout actions
 */
export function contractSettleTimeoutEpic(
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { registryContract, config$, init$ }: RaidenEpicDeps,
): Observable<contractSettleTimeout> {
  let done$: AsyncSubject<null>;
  return defer(async () => {
    done$ = new AsyncSubject();
    init$.next(done$);
    return registryContract.callStatic.settle_timeout();
  }).pipe(
    retryWhile(intervalFromConfig(config$)),
    map((settleTimeout) => contractSettleTimeout(settleTimeout.toNumber() /* seconds */)),
    tap(() => {
      done$.next(null);
      done$.complete();
    }),
  );
}

function checkPendingAction(
  action: ConfirmableAction,
  provider: RaidenEpicDeps['provider'],
  blockNumber: number,
  confirmationBlocks: number,
): Observable<RaidenAction> {
  return retryAsync$(
    () => provider.getTransactionReceipt(action.payload.txHash),
    provider.pollingInterval,
  ).pipe(
    map((receipt) => {
      if (
        receipt?.confirmations !== undefined &&
        receipt.confirmations >= confirmationBlocks &&
        receipt.status // reorgs can make txs fail
      ) {
        return {
          ...action,
          // beyond setting confirmed, also re-set blockNumber,
          // which may have changed on a reorg
          payload: {
            ...action.payload,
            txBlock: receipt.blockNumber ?? action.payload.txBlock,
            confirmed: true,
          },
        } as RaidenAction;
      } else if (action.payload.txBlock + 2 * confirmationBlocks < blockNumber) {
        // if this txs didn't get confirmed for more than 2*confirmationBlocks, it was removed
        return {
          ...action,
          payload: { ...action.payload, confirmed: false },
        } as RaidenAction;
      } // else, it seems removed, but give it twice confirmationBlocks to be picked up again
    }),
    filter(isntNil),
  );
}

/**
 * Process new blocks and re-emit confirmed or removed actions
 *
 * Events can also be confirmed by `fromEthersEvent + map(logToContractEvent)` combination.
 * Notice that this epic does not know how to parse a tx log to update an action which payload was
 * composed of values which can change upon reorgs. It only checks if given txHash is still present
 * on the blockchain. `fromEthersEvent` can usually emit unconfirmed events multiple times to
 * update/replace the pendingTxs action if needed, and also should emit the confirmed action with
 * proper values; therefore, one should only relay on this epic to confirm an action if there's
 * nothing critical depending on values in it's payload which can change upon reorgs.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps members
 * @param deps.config$ - Config observable
 * @param deps.provider - Eth provider
 * @param deps.latest$ - Latest observable
 * @returns Observable of confirmed or removed actions
 */
export function confirmationEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { config$, provider, latest$ }: RaidenEpicDeps,
): Observable<RaidenAction> {
  return combineLatest([
    state$.pipe(pluckDistinct('blockNumber')),
    state$.pipe(pluck('pendingTxs')),
    config$.pipe(pluckDistinct('confirmationBlocks'), completeWith(state$)),
  ]).pipe(
    filter(([, pendingTxs]) => pendingTxs.length > 0),
    // exhaust will ignore blocks while concat$ is busy
    exhaustMap(([blockNumber, pendingTxs, confirmationBlocks]) =>
      from(pendingTxs).pipe(
        // only txs/confirmable actions which are more than confirmationBlocks in the past
        filter((a) => a.payload.txBlock + confirmationBlocks < blockNumber),
        concatMap((action) =>
          checkPendingAction(action, provider, blockNumber, confirmationBlocks).pipe(
            // unsubscribe if it gets cleared from 'pendingTxs' while checking, to avoid duplicate
            takeUntil(
              latest$.pipe(
                filter(
                  ({ state }) =>
                    !state.pendingTxs.some(
                      (a) => a.type === action.type && a.payload.txHash === action.payload.txHash,
                    ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
