/// <reference path="../typings/matrix-js-sdk/index.d.ts" />
import { Contract, EventFilter, Event } from 'ethers';
import { Provider, JsonRpcProvider, Listener } from 'ethers/providers';
import { Network } from 'ethers/utils';
import { getNetwork as parseNetwork } from 'ethers/utils/networks';
import { flatten, sortBy } from 'lodash';

import fetch from 'cross-fetch';
import { MatrixClient } from 'matrix-js-sdk';
import { encodeUri } from 'matrix-js-sdk/lib/utils';

import { Observable, fromEventPattern, merge, from, of, defer, EMPTY } from 'rxjs';
import { filter, first, map, mergeAll, switchMap, withLatestFrom, mergeMap } from 'rxjs/operators';

/**
 * Like rxjs' fromEvent, but event can be an EventFilter
 */
export function fromEthersEvent<T>(
  target: Provider | Contract,
  event: EventFilter | string,
  resultSelector?: (...args: any[]) => T,  // eslint-disable-line
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
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * @param provider Provider to fetch data from
 * @returns Promise to Network
 */
export async function getNetwork(provider: JsonRpcProvider): Promise<Network> {
  return parseNetwork(parseInt(await provider.send('net_version', [])));
}

/**
 * From a yaml list string, return as Array
 * E.g. yamlListToArray(`
 * # comment
 *   - test1
 *   - test2
 *   - test3
 * `) === ['test1', 'test2', 'test3']
 * @param yml String containing only YAML list
 */
export function yamlListToArray(yml: string): string[] {
  // match all strings starting with optional spaces followed by a dash + space
  // capturing only the content of the list item, trimming spaces
  const reg = /^\s*-\s*(.+?)\s*$/gm;
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = reg.exec(yml))) {
    results.push(match[1]);
  }
  return results;
}

/**
 * Given a server name (with or without schema and port), return HTTP GET round trip time
 * @param server Server name with or without schema
 * @returns Promise to a { server, rtt } object, where `rtt` may be NaN
 */
export async function matrixRTT(server: string): Promise<{ server: string; rtt: number }> {
  let url = server;
  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }
  url += `/_matrix/client/versions`;
  let start = Date.now();
  try {
    const resp = await fetch(url);
    if (resp.status < 200 || resp.status >= 300) throw NaN;
  } catch (e) {
    start = NaN; // return will also be NaN
  }
  return { server, rtt: Date.now() - start };
}

/**
 * Return server name without schema or path
 * @param server any URL
 * @returns server URL with domain and port (if present), without schema, paths or query params
 */
export function getServerName(server: string): string | null {
  const match = /^(?:\w*:?\/\/)?([^/#?&]+)/.exec(server);
  return match && match[1];
}

/**
 * MatrixClient doesn't expose this API, but it does exist, so we create it here
 * @param matrix an already setup and started MatrixClient
 * @param userId to fetch status/presence from
 * @returns Promise to object containing status data
 */
export function getUserPresence(
  matrix: MatrixClient,
  userId: string,
): Promise<{
  presence: string;
  last_active_ago?: number;
  status_msg?: string;
  currently_active?: boolean;
}> {
  const path = encodeUri('/presence/$userId/status', { $userId: userId });
  return matrix._http.authedRequest(undefined, 'GET', path);
}
