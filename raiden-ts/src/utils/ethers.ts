/* eslint-disable @typescript-eslint/no-explicit-any */
import { hexValue } from '@ethersproject/bytes';
import type { Contract, Event } from '@ethersproject/contracts';
import type {
  EventType,
  Filter,
  JsonRpcProvider,
  Listener,
  Log,
  Network,
  Provider,
} from '@ethersproject/providers';
import { Formatter } from '@ethersproject/providers';
import memoize from 'lodash/memoize';
import type { Observable } from 'rxjs';
import { defer, from, fromEventPattern, of, timer } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  exhaustMap,
  ignoreElements,
  map,
  mergeMap,
  repeatWhen,
  switchMap,
  takeWhile,
  tap,
} from 'rxjs/operators';

import { DEFAULT_CONFIRMATIONS } from '../constants';
import type { TypedEventFilter, TypedListener } from '../contracts/commons';
import { assert } from './error';
import { mergeWith } from './rx';
import { decode, HexString } from './types';

declare const _filter: unique symbol;
/**
 * Extract the union of TypedEventFilters for a given contract
 */
export type ContractFilter<
  C extends Contract,
  E extends keyof C['filters'] = keyof C['filters'],
> = ReturnType<C['filters'][E]>;
/**
 * A simple Log, but tagged (at typecheck-time) to indicate the logs will map to a specific
 * TypedEvent/EventTuple
 */
export type FilteredLog<F extends TypedEventFilter<any[], any>> = Log & {
  readonly [_filter]: F;
};
type FilterFromLog<L extends Log> = L extends { readonly [_filter]: infer F } ? F : never;
// a part of a Filter which definitely has fromBlock & toBlock defined and numeric
type BlockRange = { fromBlock: number; toBlock: number };
// like Filter, but 'address' can be a set of contracts addresses, instead of a single one
type MultiFilter = Omit<Filter, 'address'> & { address?: string | string[] };

/**
 * For given TypedEventFilters, return the tuple of arguments plus the TypedEvent as last element
 */
export type EventTuple<F extends TypedEventFilter<any[], any>> = F extends TypedEventFilter<
  infer EventArgsArray,
  infer EventArgsObject
>
  ? EventArgsArray extends any[]
    ? Parameters<TypedListener<EventArgsArray, EventArgsObject>>
    : never
  : never;

export function getLogsByChunk$<F extends TypedEventFilter<any[], any>>(
  provider: JsonRpcProvider,
  filter: F & BlockRange,
  chunk?: number,
  minChunk?: number,
): Observable<FilteredLog<F>>;
export function getLogsByChunk$(
  provider: JsonRpcProvider,
  filter: MultiFilter & BlockRange,
  chunk?: number,
  minChunk?: number,
): Observable<Log>;

/**
 * Like JsonRpcProvider.getLogs, but split block scan range in chunks, adapting to smaller chunks
 * in case provider times out with such big ranges, and also supporting arrays of addresses in
 * filter.address field, to scan multiple similar contracts on a single request.
 *
 * @param provider - Provider to getLogs from
 * @param filter - getLogs filter
 * @param filter.address - Contract address or array of addresses
 * @param filter.topics - Array of topics
 * @param filter.fromBlock - Scan block start
 * @param filter.toBlock - Scan block end
 * @param chunk - Initial chunk size
 * @param minChunk - Minimum chunk size in case of getLogs errors
 * @returns Observable of fetched logs
 */
export function getLogsByChunk$(
  provider: JsonRpcProvider,
  filter: MultiFilter & BlockRange,
  chunk = 1e5,
  minChunk = 1e3,
): Observable<Log> {
  const { fromBlock, toBlock } = filter;
  // this defer ensures consistent behavior upon re-subscription
  return defer(() => {
    let start = fromBlock;
    let curChunk = chunk;
    let retry = 3;
    // every time repeatWhen re-subscribes to this defer, yield (current/retried/next) range/chunk
    return defer(async () =>
      provider.send('eth_getLogs', [
        {
          ...filter,
          fromBlock: hexValue(start),
          toBlock: hexValue(Math.min(start + curChunk - 1, toBlock)),
        },
      ]),
    ).pipe(
      // mimics the post-request handling on BaseProvider.getLogs
      map((logs) => {
        logs.forEach((log: { removed?: boolean }) => {
          if (log.removed == null) log.removed = false;
        });
        return Formatter.arrayOf(provider.formatter.filterLog.bind(provider.formatter))(
          logs,
        ) as Log[];
      }),
      tap({
        complete: () => (start += curChunk), // on success, increment range start
        error: () => {
          // on error, halven curChunk (retried), with minChunk as lower bound;
          curChunk = Math.round(curChunk / 2);
          if (curChunk < minChunk) {
            curChunk = minChunk;
            retry--;
          }
        },
      }),
      mergeMap((logs) => from(logs)), // unwind
      // if it still fail [retry] times on lower bound, give up;
      // otherwise wait pollingInterval before retrying
      catchError((err) => {
        if (retry >= 0) return timer(provider.pollingInterval).pipe(ignoreElements());
        throw err;
      }),
      // repeat from inner defer while there's still ranges to scan
      repeatWhen((complete$) => complete$.pipe(takeWhile(() => start <= toBlock))),
    );
  });
}

export function fromEthersEvent<T>(
  target: JsonRpcProvider,
  event: string | string[],
): Observable<T>;
export function fromEthersEvent<F extends TypedEventFilter<any[], any>>(
  target: JsonRpcProvider,
  event: F,
  opts?: {
    fromBlock?: number;
    confirmations?: number | Observable<number>;
    blockNumber$?: Observable<number>;
    onPastCompleted?: (elapsedMs: number) => void;
  },
): Observable<FilteredLog<F>>;
export function fromEthersEvent<T extends Log>(
  target: JsonRpcProvider,
  event: Filter,
  opts?: {
    fromBlock?: number;
    confirmations?: number | Observable<number>;
    blockNumber$?: Observable<number>;
    onPastCompleted?: (elapsedMs: number) => void;
  },
): Observable<T>;
/**
 * Like rxjs' fromEvent, but event can be an EventFilter
 *
 * @param target - Object to hook event listener, maybe a Provider or Contract
 * @param event - EventFilter or string representing the event to listen to
 * @param opts - Options object
 * @param opts.fromBlock - Block since when to fetch events from
 * @param opts.confirmations - After how many blocks a tx is considered confirmed; if observable,
 *    it should have a value at subscription time, like a ReplaySubject(1);
 * @param opts.blockNumber$ - New blockNumber observable
 * @param opts.onPastCompleted - Callback when first/past blocks scan completes
 * @returns Observable of target.on(event) events
 */
export function fromEthersEvent<T>(
  target: JsonRpcProvider,
  event: EventType,
  {
    fromBlock,
    confirmations,
    blockNumber$,
    onPastCompleted,
  }: {
    fromBlock?: number;
    confirmations?: number | Observable<number>;
    blockNumber$?: Observable<number>;
    onPastCompleted?: (elapsedMs: number) => void;
  } = {},
) {
  if (typeof event === 'string' || Array.isArray(event))
    return fromEventPattern<T>(
      (handler: Listener) => target.on(event, handler),
      (handler: Listener) => target.removeListener(event, handler),
    ) as Observable<T>;

  const confirmations$ = !confirmations
    ? of(DEFAULT_CONFIRMATIONS)
    : typeof confirmations === 'number'
    ? of(confirmations)
    : confirmations;
  const blockQueue: number[] = []; // sorted 'fromBlock' queue, at most of [confirmations * 2] size
  let start = Date.now();
  return confirmations$.pipe(
    distinctUntilChanged(),
    mergeWith((confirmations) => {
      if (!fromBlock) {
        let resetBlock = target._lastBlockNumber;
        const innerBlockNumber = target.blockNumber;
        resetBlock =
          resetBlock && resetBlock > 0
            ? resetBlock
            : innerBlockNumber && innerBlockNumber > 0
            ? innerBlockNumber
            : confirmations + 1;
        // starts 'blockQueue' with subscription-time's resetEventsBlock
        fromBlock = resetBlock - confirmations;
      }
      blockQueue.splice(0, blockQueue.length, fromBlock);

      return blockNumber$ ?? fromEthersEvent<number>(target, 'block');
    }, switchMap),
    debounceTime(Math.ceil(target.pollingInterval / 10)), // debounce bursts of blocks
    // exhaustMap will skip new events if it's still busy with a previous getLogs call,
    // but next [fromBlock] in queue always includes range for any skipped block
    exhaustMap(([confirmations, blockNumber]) =>
      getLogsByChunk$(target, { ...event, fromBlock: blockQueue[0], toBlock: blockNumber }).pipe(
        tap({
          next: (log) => {
            // don't clear blockQueue for non-confirmed logs
            if (!log.blockNumber || log.blockNumber + confirmations > blockNumber) return;
            const nextBlock = log.blockNumber + 1;
            // index of first block which should stay on the queue;
            let clearHead = blockQueue.findIndex((b) => b > nextBlock);
            if (!clearHead) return;
            else if (clearHead < 0) clearHead = blockQueue.length; // clear whole queue
            blockQueue.splice(0, clearHead, nextBlock);
            // invariant: blockQueue length never increases here
          },
          complete: () => {
            // if queue is full, pop_front 'fromBlock' which was just queried
            // half for confirmed, half for unconfirmed logs
            while (blockQueue.length >= confirmations * 2) blockQueue.shift();
            if (onPastCompleted && start) {
              start = 0;
              // this is called only once as soon as first stretch/past scan completes
              onPastCompleted(Date.now() - start);
            }
            // push_back next block iff getLogs didn't throw, queue is never empty
            blockQueue.push(blockNumber + 1);
          },
        }),
      ),
    ),
  );
}

/**
 * Function to map an ethers's Provider log to a contract event tuple
 * It requires logs coming from getLogsByChunk$ or fromEthersEvent overloads which tag at
 * type-check time to which set of events the logs belong, and use that information to narrow
 * the types of the tuple events emitted
 *
 * @param contract - Contract fo parse logs for
 * @returns Function to map logs to event tuples for contract
 */
export function logToContractEvent<C extends Contract>(contract: C) {
  return function mapper<L extends FilteredLog<ContractFilter<C>>>(
    log: L,
  ): EventTuple<FilterFromLog<L>> {
    // parse log into [...args, event: Event] array,
    // the same that contract.on events/callbacks
    const parsed = contract.interface.parseLog(log);
    // not all parameters quite needed right now, but let's comply with the interface
    const event: Event = {
      ...log,
      ...parsed,
      removeListener: () => {
        /* getLogs don't install filter */
      },
      getBlock: () => contract.provider.getBlock(log.blockHash!),
      getTransaction: () => contract.provider.getTransaction(log.transactionHash!),
      getTransactionReceipt: () => contract.provider.getTransactionReceipt(log.transactionHash!),
    };
    return [...parsed.args, event] as EventTuple<FilterFromLog<L>>;
  };
}

/**
 * Return a network name, if known, or stringified chainId otherwise
 *
 * @param network - Network to get name from
 * @returns name or chainId as string
 */
export function getNetworkName(network: Network) {
  return network.name === 'unknown'
    ? network.chainId.toString()
    : network.name === 'homestead'
    ? 'mainnet'
    : network.name;
}

// memoized get contract's code as hex string
const getContractCode = memoize(async function _getContractCode(
  address: string,
  provider: Provider,
) {
  return provider.getCode(address);
});

/**
 * Verify that contract has given method
 *
 * @param sighash - method to search for, as signature hash
 * @param contract - Contract-like interface
 * @param contract.address - Contract's address
 * @param contract.provider - Contract's provider
 * @returns truthy if contract has a method with given signature
 */
export async function contractHasMethod(
  sighash: HexString<4>,
  { address, provider }: { address: string; provider: Provider },
): Promise<boolean> {
  const code = await getContractCode(address, provider);
  const push4opcode = '63'; // 0x63 is PUSH4 opcode, prefixes sighash in method contracts
  return code.includes(push4opcode + sighash.substr(2));
}

/**
 * Fetches contract's code and parse if it has given method (by name)
 *
 * @param contract - contract instance to check
 * @param method - method name
 * @returns Observable of true, emitting a single value if successful, or erroring
 */
export function checkContractHasMethod$<C extends Contract>(
  contract: C,
  method: keyof C['functions'] & string,
): Observable<true> {
  return defer(async () => {
    const sighash = contract.interface.getSighash(method);
    // decode shouldn't fail if building with ^0.39 contracts, but runtime may be running
    // with 0.37 contracts, and the only way to know is by checking contract's code (memoized)
    assert(
      await contractHasMethod(decode(HexString(4), sighash, 'signature hash not found'), contract),
      ['contract does not have method', { contract: contract.address, method }],
    );
    return true as const;
  });
}
