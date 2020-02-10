/* eslint-disable @typescript-eslint/no-explicit-any */
import { Contract, Event } from 'ethers';
import { Provider, JsonRpcProvider, Listener, EventType, Filter, Log } from 'ethers/providers';
import { Network } from 'ethers/utils';
import { getNetwork as parseNetwork } from 'ethers/utils/networks';
import { flatten, sortBy } from 'lodash';
import { Observable, fromEventPattern, merge, from, of, EMPTY, combineLatest, defer } from 'rxjs';
import { filter, first, map, switchMap, mergeMap, share } from 'rxjs/operators';

import { isntNil } from './types';

/**
 * Like rxjs' fromEvent, but event can be an EventFilter
 *
 * @param target - Object to hook event listener, maybe a Provider or Contract
 * @param event - EventFilter or string representing the event to listen to
 * @param resultSelector - A map of events arguments to output parameters
 *      Default is to pass only first parameter
 * @returns Observable of target.on(event) events
 */
export function fromEthersEvent<T>(
  target: Provider,
  event: EventType,
  resultSelector?: (...args: any[]) => T, // eslint-disable-line
): Observable<T> {
  return fromEventPattern<T>(
    (handler: Listener) => target.on(event, handler),
    (handler: Listener) => target.removeListener(event, handler),
    resultSelector,
  ) as Observable<T>;
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
export function getEventsStream<T extends any[]>(
  contract: Contract,
  filters: Filter[],
  fromBlock$?: Observable<number>,
): Observable<T> {
  const provider = contract.provider as JsonRpcProvider;

  const logToEvent = (log: Log): T | undefined => {
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
      getBlock: () => provider.getBlock(log.blockHash!),
      getTransaction: () => provider.getTransaction(log.transactionHash!),
      getTransactionReceipt: () => provider.getTransactionReceipt(log.transactionHash!),
      decode: (data: string, topics?: string[]) => parsed.decode(data, topics || log.topics),
    };
    return [...args, event] as T;
  };

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
            map(b => provider.blockNumber ?? b),
          ),
    ).pipe(share());
    pastEvents$ = combineLatest(fromBlock$, nextBlock$).pipe(
      first(),
      switchMap(([fromBlock, toBlock]) =>
        Promise.all(filters.map(filter => provider.getLogs({ ...filter, fromBlock, toBlock }))),
      ),
      // flatten array of each getLogs query response and sort them
      // emit log array elements as separate logs into stream (unwind)
      mergeMap(logs => from(sortBy(flatten(logs), ['blockNumber']))),
      map(logToEvent),
      filter(isntNil),
    );
  }

  // new events (in open-interval=]lastSeenBlock, latest])
  // where lastSeenBlock is the currentBlock at call time
  // doesn't complete, keep emitting events for each new block (if any) until unsubscription
  const newEvents$: Observable<T> = nextBlock$.pipe(
    switchMap(() => from(filters)),
    mergeMap(filter => fromEthersEvent<Log>(provider, filter)),
    map(logToEvent),
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
  provider.send = async function(method: string, params: any): Promise<any> {
    if (method === 'eth_sign') {
      // try 'personal_sign' by default instead of 'eth_sign'
      return origSend.apply(this, ['personal_sign', [params[1], params[0]]]).catch(err => {
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
  return network.name !== 'unknown' ? network.name : network.chainId.toString();
}
