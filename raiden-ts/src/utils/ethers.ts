/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Contract, Event } from '@ethersproject/contracts';
import type {
  JsonRpcProvider,
  Listener,
  EventType,
  Filter,
  Log,
  Network,
} from '@ethersproject/providers';
import { Observable, fromEventPattern, from, defer, throwError, timer } from 'rxjs';
import {
  mergeMap,
  debounceTime,
  exhaustMap,
  tap,
  catchError,
  repeatWhen,
  takeWhile,
  ignoreElements,
} from 'rxjs/operators';

/**
 * @param provider - Provider to getLogs from
 * @param filter - getLogs filter
 * @param chunk - Initial chunk size
 * @param minChunk - Minimum chunk size in case of getLogs errors
 * @returns Observable of fetched logs
 */
export function getLogsByChunk$(
  provider: JsonRpcProvider,
  filter: Filter & { fromBlock: number; toBlock: number },
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
      provider.getLogs({
        ...filter,
        fromBlock: start,
        toBlock: Math.min(start + curChunk - 1, toBlock),
      }),
    ).pipe(
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
      catchError((err) =>
        retry >= 0 ? timer(provider.pollingInterval).pipe(ignoreElements()) : throwError(err),
      ),
      // repeat from inner defer while there's still ranges to scan
      repeatWhen((complete$) => complete$.pipe(takeWhile(() => start <= toBlock))),
    );
  });
}

export function fromEthersEvent<T>(
  target: JsonRpcProvider,
  event: string | string[],
): Observable<T>;
export function fromEthersEvent<T extends Log>(
  target: JsonRpcProvider,
  event: Filter,
  confirmations?: number,
  fromBlock?: number,
): Observable<T>;
/**
 * Like rxjs' fromEvent, but event can be an EventFilter
 *
 * @param target - Object to hook event listener, maybe a Provider or Contract
 * @param event - EventFilter or string representing the event to listen to
 * @param confirmations - After how many blocks a tx is considered confirmed
 * @param fromBlock - Block since when to fetch events from
 * @returns Observable of target.on(event) events
 */
export function fromEthersEvent<T>(
  target: JsonRpcProvider,
  event: EventType,
  confirmations = 5,
  fromBlock?: number,
) {
  if (typeof event === 'string' || Array.isArray(event))
    return fromEventPattern<T>(
      (handler: Listener) => target.on(event, handler),
      (handler: Listener) => target.removeListener(event, handler),
    ) as Observable<T>;

  const range = confirmations * 2; // half for confirmed, half for unconfirmed logs
  const blockQueue: number[] = []; // sorted 'fromBlock' queue, at most of [range] size
  return defer(() => {
    if (!fromBlock) {
      // 'resetEventsBlock' is private, set at [[Raiden]] constructor, so we need 'any'
      let resetBlock: number = (target as any)._lastBlockNumber;
      const innerBlockNumber = target.blockNumber;
      resetBlock =
        resetBlock && resetBlock > 0
          ? resetBlock
          : innerBlockNumber && innerBlockNumber > 0
          ? innerBlockNumber
          : 1;
      fromBlock = resetBlock - confirmations;
    }
    // starts 'blockQueue' with subscription-time's resetEventsBlock
    blockQueue.splice(0, blockQueue.length, fromBlock);

    return fromEthersEvent<number>(target, 'block');
  }).pipe(
    debounceTime(Math.ceil(target.pollingInterval / 10)), // debounce bursts of blocks
    // exhaustMap will skip new events if it's still busy with a previous getLogs call,
    // but next [fromBlock] in queue always includes range for any skipped block
    exhaustMap((blockNumber) =>
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
            while (blockQueue.length >= range) blockQueue.shift();
            // push_back next block iff getLogs didn't throw, queue is never empty
            blockQueue.push(blockNumber + 1);
          },
        }),
      ),
    ),
  );
}

export type ContractEvent =
  | [Event]
  | [any, Event]
  | [any, any, Event]
  | [any, any, any, Event]
  | [any, any, any, any, Event]
  | [any, any, any, any, any, Event]
  | [any, any, any, any, any, any, Event]
  | [any, any, any, any, any, any, any, Event]
  | [any, any, any, any, any, any, any, any, Event]
  | [any, any, any, any, any, any, any, any, any, Event];
export function logToContractEvent<T extends ContractEvent>(
  contract: Contract,
): (log: Log) => T | undefined;
export function logToContractEvent<T extends ContractEvent>(
  contract: Contract,
  log: Log,
): T | undefined;
/**
 * Curried(2) function to map an ethers's Provider log to a contract event tuple
 *
 * @param contract - Contract instance
 * @param log - Log to map
 * @returns Tuple of events args plus Event object
 */
export function logToContractEvent<T extends ContractEvent>(contract: Contract, log?: Log) {
  const mapper = (log: Log): T | undefined => {
    // parse log into [...args, event: Event] array,
    // the same that contract.on events/callbacks
    const parsed = contract.interface.parseLog(log);
    // ignore removed (reorg'd) events (reorgs are handled by ConfirmableActions logic)
    // and parse errors (shouldn't happen)
    if (log.removed === true || !parsed) return;
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
    return [...parsed.args, event] as T;
  };
  return log !== undefined ? mapper(log) : mapper;
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
