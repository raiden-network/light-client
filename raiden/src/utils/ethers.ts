/* eslint-disable @typescript-eslint/no-explicit-any */
import { Contract, EventFilter, Event } from 'ethers';
import { Provider, JsonRpcProvider, Listener } from 'ethers/providers';
import { Network } from 'ethers/utils';
import { getNetwork as parseNetwork } from 'ethers/utils/networks';
import { flatten, sortBy } from 'lodash';

import { Observable, fromEventPattern, merge, from, of, defer, EMPTY } from 'rxjs';
import { filter, first, map, mergeAll, switchMap, withLatestFrom, mergeMap } from 'rxjs/operators';

/**
 * Like rxjs' fromEvent, but event can be an EventFilter
 *
 * @param target  Object to hook event listener, maybe a Provider or Contract
 * @param event  EventFilter or string representing the event to listen to
 * @param resultSelector  A map of events arguments to output parameters
 *      Default is to pass only first parameter
 * @returns Observable of target.on(event) events
 */
export function fromEthersEvent<T>(
  target: Provider | Contract,
  event: EventFilter | string,
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
 * @param contract  Contract source instance for filters, connected to a provider
 * @param filters  array of OR filters from tokenNetwork
 * @param fromBlock$  Observable of a past blockNumber since when to fetch past events
 * @param lastSeenBlock$  Observable of latest seen block, to be used as toBlock of pastEvents.
 *      lastSeenBlock + 1 is supposed to be first one fetched by contract.on newEvents$
 *      Both fromBlock$ and lastSeenBlock$ need to be set to fetch pastEvents$
 * @returns Observable of contract's events
 */
export function getEventsStream<T extends any[]>(
  contract: Contract,
  filters: EventFilter[],
  fromBlock$?: Observable<number>,
  lastSeenBlock$?: Observable<number>,
): Observable<T> {
  const provider = contract.provider as JsonRpcProvider;
  // filters for channels opened by and with us
  const newEvents$: Observable<T> = from(filters).pipe(
    mergeMap(filter => fromEthersEvent(contract, filter, (...args) => args as T)),
  );

  let pastEvents$: Observable<T> = EMPTY;
  if (fromBlock$ && lastSeenBlock$) {
    pastEvents$ = fromBlock$.pipe(
      withLatestFrom(
        defer(() => (provider.blockNumber ? of(provider.blockNumber) : lastSeenBlock$)),
      ),
      first(),
      switchMap(async ([fromBlock, toBlock]) => {
        const logs = await Promise.all(
          filters.map(filter => provider.getLogs({ ...filter, fromBlock, toBlock })),
        );
        // flatten array of each getLogs query response and sort them
        // emit log array elements as separate logs into stream
        return from(sortBy(flatten(logs), ['blockNumber']));
      }),
      mergeAll(), // async return above will be a Promise of an Observable, so unpack inner$
      map(log => {
        // parse log into [...args, event: Event] array,
        // the same that contract.on events/callbacks
        const parsed = contract.interface.parseLog(log);
        if (!parsed) return;
        const args = Array.prototype.slice.call(parsed.values);
        // not all parameters quite needed right now, but let's comply with the interface
        const event: Event = {
          ...log,
          ...parsed,
          args,
          removeListener: () => {},
          getBlock: () => provider.getBlock(log.blockHash!),
          getTransaction: () => provider.getTransaction(log.transactionHash!),
          getTransactionReceipt: () => provider.getTransactionReceipt(log.transactionHash!),
          decode: undefined,
        };
        return [...args, event];
      }),
      filter((event): event is T => !!event),
    );
  }

  return merge(pastEvents$, newEvents$);
}

/**
 * Like Provider.getNetwork, but fetches every time instead of using cached property
 *
 * @param provider Provider to fetch data from
 * @returns Promise of Network info
 */
export async function getNetwork(provider: JsonRpcProvider): Promise<Network> {
  return parseNetwork(parseInt(await provider.send('net_version', [])));
}

/**
 * Patch JsonRpcProvider.send to try personal_sign first, and fallback to eth_sign if it fails
 * Call it once on the provider instance
 *
 * @param provider  A JsonRpcProvider instance to patch
 */
export function patchSignSend(provider: JsonRpcProvider): void {
  const origSend: (method: string, params: any) => Promise<any> = (provider as any).send;
  Object.assign(provider as any, {
    send: async function send(method: string, params: any): Promise<any> {
      if (method === 'eth_sign') {
        // try 'personal_sign' by default instead of 'eth_sign'
        return origSend
          .bind(this)('personal_sign', [params[1], params[0]])
          .catch(reason => {
            // on first error, if personal_sign isn't available
            if (
              reason instanceof Error &&
              reason.message.includes('The method personal_sign does not exist')
            ) {
              Object.assign(provider as any, { send: origSend }); // un-patch
              return provider.send(method, params); // and retry with eth_sign
            }
            throw reason; // else, re-raise
          });
      }
      return origSend.bind(this)(method, params);
    },
  });
}
