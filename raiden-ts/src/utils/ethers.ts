/* eslint-disable @typescript-eslint/no-explicit-any */
import { Contract, Event } from 'ethers/contract';
import { JsonRpcProvider, Listener, EventType, Filter, Log } from 'ethers/providers';
import { Network } from 'ethers/utils';
import { getNetwork as parseNetwork } from 'ethers/utils/networks';
import { Observable, fromEventPattern, merge, from, of, EMPTY, combineLatest, defer } from 'rxjs';
import {
  filter,
  first,
  map,
  mergeMap,
  share,
  toArray,
  debounceTime,
  catchError,
  exhaustMap,
} from 'rxjs/operators';
import sortBy from 'lodash/sortBy';

import { isntNil } from './types';

export function fromEthersEvent<T>(
  target: JsonRpcProvider,
  event: string | string[],
  resultSelector?: (...args: any[]) => T,
): Observable<T>;
export function fromEthersEvent<T extends Log>(
  target: JsonRpcProvider,
  event: Filter,
  resultSelector?: (...args: any[]) => T,
  range?: number,
): Observable<T>;
/**
 * Like rxjs' fromEvent, but event can be an EventFilter
 *
 * @param target - Object to hook event listener, maybe a Provider or Contract
 * @param event - EventFilter or string representing the event to listen to
 * @param resultSelector - A map of events arguments to output parameters
 *      Default is to pass only first parameter
 * @param range - Range (confirmation) blocks in the past to fetch events from
 * @returns Observable of target.on(event) events
 */
export function fromEthersEvent<T>(
  target: JsonRpcProvider,
  event: EventType,
  resultSelector?: (...args: any[]) => T,
  range = 5,
) {
  if (typeof event === 'string' || Array.isArray(event))
    return fromEventPattern<T>(
      (handler: Listener) => target.on(event, handler),
      (handler: Listener) => target.removeListener(event, handler),
      resultSelector,
    ) as Observable<T>;

  const blockQueue: number[] = []; // sorted 'fromBlock' queue, at most of [range] size
  return defer(() => {
    // 'resetEventsBlock' is private, set at [[Raiden]] constructor, so we need 'any'
    const resetBlock: number = (target as any)._lastBlockNumber;
    const firstBlock = resetBlock && resetBlock > 0 ? resetBlock : target.blockNumber ?? 1;
    blockQueue.push(firstBlock); // starts 'blockQueue' with subscription-time's resetEventsBlock

    return fromEthersEvent<number>(target, 'block');
  }).pipe(
    debounceTime(Math.ceil(target.pollingInterval / 10)), // debounce bursts of blocks
    // exhaustMap will skip new events if it's still busy with a previous getLogs call,
    // but next [fromBlock] in queue always includes range for any skipped block
    exhaustMap((blockNumber) =>
      defer(() =>
        target.getLogs({ ...event, fromBlock: blockQueue[0], toBlock: blockNumber }),
      ).pipe(
        mergeMap((logs) => {
          // if queue is full, pop_front 'fromBlock' which was just queried
          if (blockQueue.length >= range) blockQueue.shift();
          // push_back next block iff getLogs didn't throw, queue is never empty
          blockQueue.push(blockNumber + 1);

          // if a log came, clear queued smaller blocks than it and push_front block after
          const afterLogBlock =
            Math.max(0, ...logs.map((log) => log.blockNumber).filter(isntNil)) + 1;
          if (blockQueue[0] <= afterLogBlock)
            blockQueue.splice(
              0, // from queue's front
              blockQueue.filter((block) => block <= afterLogBlock).length, // clear older blocks
              afterLogBlock, // push_front block after newest log's blockNumber
            );

          return from(logs); // unwind logs
        }),
        // `getLogs` errors skip [blockQueue] update, so previous fromBlock is retried later
        catchError(() => EMPTY),
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
    const args = Array.prototype.slice.call(parsed.values);
    // not all parameters quite needed right now, but let's comply with the interface
    const event: Event = {
      ...log,
      ...parsed,
      args,
      removeListener: () => {
        /* getLogs don't install filter */
      },
      getBlock: () => contract.provider.getBlock(log.blockHash!),
      getTransaction: () => contract.provider.getTransaction(log.transactionHash!),
      getTransactionReceipt: () => contract.provider.getTransactionReceipt(log.transactionHash!),
      decode: (data: string, topics?: string[]) => parsed.decode(data, topics || log.topics),
    };
    return [...args, event] as T;
  };
  return log !== undefined ? mapper(log) : mapper;
}

/**
 * getEventsStream returns a stream of T-type tuples (arrays) from Contract's
 * events from filters. These events are polled since provider's [re]setEventsBlock to newest
 * polled block. If both 'fromBlock$' and 'lastSeenBlock$' are specified, also fetch past events
 * since fromBlock up to lastSeenBlock$ === provider.resetEventsBlock - 1
 * T must be a tuple-like type receiving all filters arguments plus the respective Event in the end
 *
 * @param contract - Contract source instance for filters, connected to a provider
 * @param filters - array of OR filters from tokenNetwork
 * @param fromBlock$ - Observable of a past blockNumber since when to fetch past events
 *                     If not provided, last resetEventsBlock is automatically used.
 * @returns Observable of contract's events
 */
export function getEventsStream<T extends ContractEvent>(
  contract: Contract,
  filters: Filter[],
  fromBlock$?: Observable<number>,
): Observable<T> {
  const provider = contract.provider as JsonRpcProvider;

  // past events (in the closed-interval=[fromBlock, lastSeenBlock]),
  // fetch once, sort by blockNumber, emit all, complete
  let pastEvents$: Observable<T> = EMPTY,
    // of(constant) ensures newEvents$ is registered immediately if fromBlock$ not provided
    nextBlock$: Observable<number> = of(-1);
  if (fromBlock$) {
    // if fetching pastEvents$, nextBlock$ is used to sync/avoid intersection between Events$
    // pastEvents$ => [fromBlock$, nextBlock$], newEvents$ => ]nextBlock$, ...latest]
    nextBlock$ = defer(() =>
      provider.blockNumber
        ? of(provider.blockNumber)
        : fromEthersEvent<number>(provider, 'block').pipe(
            first(),
            map(() => provider.blockNumber),
            share(),
          ),
    );
    pastEvents$ = combineLatest(fromBlock$, nextBlock$).pipe(
      first(),
      mergeMap(([fromBlock, toBlock]) =>
        from(filters).pipe(
          mergeMap((filter) => provider.getLogs({ ...filter, fromBlock, toBlock })),
          // flatten array of each getLogs query response and sort them
          // emit log array elements as separate logs into stream (unwind)
          mergeMap(from),
          toArray(),
          mergeMap((logs) => from(sortBy(logs, ['blockNumber']))),
        ),
      ),
      map(logToContractEvent<T>(contract)),
      filter(isntNil),
    );
  }

  // new events (in open-interval=]lastSeenBlock, latest])
  // where lastSeenBlock is the currentBlock at call time
  // doesn't complete, keep emitting events for each new block (if any) until unsubscription
  const newEvents$: Observable<T> = nextBlock$.pipe(
    mergeMap(() => from(filters)),
    mergeMap((filter) => fromEthersEvent<Log>(provider, filter)),
    map(logToContractEvent<T>(contract)),
    filter(isntNil),
  );

  return merge(pastEvents$, newEvents$);
}

/**
 * Like Provider.getNetwork, but fetches every time instead of using cached property
 *
 * @param provider - Provider to fetch data from
 * @returns Promise of Network info
 */
export async function getNetwork(provider: JsonRpcProvider): Promise<Network> {
  return parseNetwork(parseInt(await provider.send('net_version', [])));
}

/**
 * Patch JsonRpcProvider.send to try personal_sign first, and fallback to eth_sign if it fails
 * Call it once on the provider instance
 *
 * @param provider - A JsonRpcProvider instance to patch
 */
export function patchSignSend(provider: JsonRpcProvider): void {
  const origSend: (method: string, params: any) => Promise<any> = provider.send;
  provider.send = async function (method: string, params: any): Promise<any> {
    if (method === 'eth_sign') {
      // try 'personal_sign' by default instead of 'eth_sign'
      return origSend.apply(this, ['personal_sign', [params[1], params[0]]]).catch((err) => {
        // on first error, if personal_sign isn't available
        if (
          err instanceof Error &&
          (err.message.includes('The method personal_sign does not exist') ||
            err.message.includes('Method personal_sign not supported'))
        ) {
          provider.send = origSend; // un-patch
          return provider.send(method, params); // and retry with eth_sign
        }
        throw err; // else, re-raise
      });
    }
    return origSend.apply(this, [method, params]);
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
