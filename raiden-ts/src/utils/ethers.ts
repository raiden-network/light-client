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
import { getNetwork as parseNetwork } from '@ethersproject/networks';
import { Observable, fromEventPattern, from, EMPTY, defer } from 'rxjs';
import { mergeMap, debounceTime, catchError, exhaustMap } from 'rxjs/operators';

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
  confirmations?: number,
  fromBlock?: number,
): Observable<T>;
/**
 * Like rxjs' fromEvent, but event can be an EventFilter
 *
 * @param target - Object to hook event listener, maybe a Provider or Contract
 * @param event - EventFilter or string representing the event to listen to
 * @param resultSelector - A map of events arguments to output parameters
 *      Default is to pass only first parameter
 * @param confirmations - After how many blocks a tx is considered confirmed
 * @param fromBlock - Block since when to fetch events from
 * @returns Observable of target.on(event) events
 */
export function fromEthersEvent<T>(
  target: JsonRpcProvider,
  event: EventType,
  resultSelector?: (...args: any[]) => T,
  confirmations = 5,
  fromBlock?: number,
) {
  if (typeof event === 'string' || Array.isArray(event))
    return fromEventPattern<T>(
      (handler: Listener) => target.on(event, handler),
      (handler: Listener) => target.removeListener(event, handler),
      resultSelector,
    ) as Observable<T>;

  const range = confirmations * 2; // half for confirmed, half for unconfirmed logs
  const blockQueue: number[] = []; // sorted 'fromBlock' queue, at most of [range] size
  return defer(() => {
    if (!fromBlock) {
      // 'resetEventsBlock' is private, set at [[Raiden]] constructor, so we need 'any'
      let resetBlock: number = (target as any)._lastBlockNumber;
      resetBlock = resetBlock && resetBlock > 0 ? resetBlock : target.blockNumber ?? 1;
      fromBlock = resetBlock - confirmations;
    }
    blockQueue.push(fromBlock); // starts 'blockQueue' with subscription-time's resetEventsBlock

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

          // if a confirmed log comes, clear queued smaller blocks and push_front block after
          // let unconfirmed actions be emitted multiple times to update pendingTxs if needed
          const afterLogBlock =
            Math.max(
              0,
              ...logs
                .map((log) => log.blockNumber)
                .filter(isntNil)
                .filter((block) => block + confirmations <= blockNumber), // only confirmed
            ) + 1;
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
 * Like Provider.getNetwork, but fetches every time instead of using cached property
 *
 * @param provider - Provider to fetch data from
 * @returns Promise of Network info
 */
export async function getNetwork(provider: JsonRpcProvider): Promise<Network> {
  return parseNetwork(parseInt(await provider.send('net_version', [])));
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
