import * as t from 'io-ts';
import { Observable, from, of, EMPTY } from 'rxjs';
import { mergeMap, map, timeout, withLatestFrom, catchError, toArray } from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { concat as concatBytes } from '@ethersproject/bytes';
import type { Signer } from '@ethersproject/abstract-signer';
import memoize from 'lodash/memoize';

import { retryAsync$ } from '../utils/rx';
import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { networkErrorRetryPredicate, RaidenError, ErrorCodes, assert } from '../utils/error';
import { Address, UInt, decode, Signed, Signature } from '../utils/types';
import { jsonParse, encode } from '../utils/data';
import { Presences } from '../transport/types';
import { getCap } from '../transport/utils';
import { ChannelState } from '../channels/state';
import { channelAmounts, channelKey } from '../channels/utils';
import { ServiceRegistry } from '../contracts/ServiceRegistry';

import { MessageTypeId } from '../messages/utils';
import { Capabilities } from '../constants';
import { isValidUrl } from '../helpers';
import { PFS, IOU } from './types';

/**
 * Either returns true if given channel can route a payment, or a reason as string if not
 *
 * @param state - current RaidenState
 * @param presences - latest Presences mapping
 * @param tokenNetwork - tokenNetwork where the channel is
 * @param partner - possibly a partner on given tokenNetwork
 * @param target - transfer target
 * @param value - amount of tokens to check if channel can route
 * @returns true if channel can route, string containing reason if not
 */
export function channelCanRoute(
  state: RaidenState,
  presences: Presences,
  tokenNetwork: Address,
  partner: Address,
  target: Address,
  value: UInt<32>,
): true | string {
  if (!(partner in presences) || !presences[partner].payload.available)
    return `path: partner "${partner}" not available in transport`;
  if (target !== partner && !getCap(presences[partner].payload.caps, Capabilities.MEDIATE))
    return `path: partner "${partner}" doesn't mediate transfers`;
  const channel = state.channels[channelKey({ tokenNetwork, partner })];
  if (!channel) return `path: there's no direct channel with partner "${partner}"`;
  if (channel.state !== ChannelState.open)
    return `path: channel with "${partner}" in state "${channel.state}" instead of "${ChannelState.open}"`;
  const { ownCapacity: capacity } = channelAmounts(channel);
  if (capacity.lt(value))
    return `path: channel with "${partner}" doesn't have enough capacity=${capacity.toString()}`;
  return true;
}

const serviceRegistryToken = memoize(
  async (serviceRegistryContract: ServiceRegistry, pollingInterval: number) =>
    retryAsync$(
      () => serviceRegistryContract.callStatic.token(),
      pollingInterval,
      networkErrorRetryPredicate,
    ).toPromise() as Promise<Address>,
);

/**
 * Returns a cold observable which fetch PFS info & validate for a given server address or URL
 *
 * @param pfsAddrOrUrl - PFS account/address or URL
 * @param deps - RaidenEpicDeps needed for various parameters
 * @param deps.serviceRegistryContract - ServiceRegistry contract instance
 * @param deps.network - Current Network
 * @param deps.contractsInfo - ContractsInfo mapping
 * @param deps.config$ - Config observable
 * @param deps.provider - Eth provider
 * @returns Observable containing PFS server info
 */
export function pfsInfo(
  pfsAddrOrUrl: Address | string,
  { serviceRegistryContract, network, contractsInfo, provider, config$ }: RaidenEpicDeps,
): Observable<PFS> {
  /**
   * Codec for PFS /api/v1/info result schema
   */
  const PathInfo = t.type({
    message: t.string,
    network_info: t.type({
      // literals will fail if trying to decode anything different from these constants
      chain_id: t.literal(network.chainId),
      token_network_registry_address: t.literal(contractsInfo.TokenNetworkRegistry.address),
    }),
    operator: t.string,
    payment_address: Address,
    price_info: UInt(32),
    version: t.string,
  });
  // if it's an address, fetch url from ServiceRegistry, else it's already the URL
  const url$ = Address.is(pfsAddrOrUrl)
    ? retryAsync$(
        () => serviceRegistryContract.callStatic.urls(pfsAddrOrUrl),
        provider.pollingInterval,
        networkErrorRetryPredicate,
      )
    : of(pfsAddrOrUrl);
  return url$.pipe(
    withLatestFrom(config$),
    mergeMap(([url, { httpTimeout, pfsMaxFee }]) => {
      if (!url) throw new RaidenError(ErrorCodes.PFS_EMPTY_URL);
      else if (!isValidUrl(url)) throw new RaidenError(ErrorCodes.PFS_INVALID_URL, { url });
      // default to https for domain-only urls
      else if (!url.startsWith('https://') && !url.startsWith('http://')) url = `https://${url}`;

      const start = Date.now();
      return fromFetch(url + '/api/v1/info').pipe(
        timeout(httpTimeout),
        mergeMap(
          async (res) =>
            [
              decode(PathInfo, jsonParse(await res.text())),
              await serviceRegistryToken(serviceRegistryContract, provider.pollingInterval),
            ] as const,
        ),
        map(([info, token]) => {
          assert(info.price_info.lte(pfsMaxFee), [
            ErrorCodes.PFS_TOO_EXPENSIVE,
            { price: info.price_info.toString() },
          ]);
          return {
            address: info.payment_address,
            url,
            rtt: Date.now() - start,
            price: info.price_info,
            token,
          };
        }),
      );
    }),
  );
}

/**
 * Retrieve pfsInfo for these servers & return sorted PFS info
 *
 * Sort order is price then response time (rtt).
 * Throws if no server can be validated, meaning either there's none in the current network or
 * we're out-of-sync (outdated or ahead of PFS's deployment network version).
 *
 * @param pfsList - Array of PFS addresses or URLs
 * @param deps - RaidenEpicDeps array
 * @returns Observable of online, validated & sorted PFS info array
 */
export function pfsListInfo(
  pfsList: readonly (string | Address)[],
  deps: RaidenEpicDeps,
): Observable<PFS[]> {
  const { log } = deps;
  return from(pfsList).pipe(
    mergeMap(
      (addrOrUrl) =>
        pfsInfo(addrOrUrl, deps).pipe(
          catchError((err) => {
            log.warn(`Error trying to fetch PFS info for "${addrOrUrl}" - ignoring:`, err);
            return EMPTY;
          }),
        ),
      5, // maximum concurrency
    ),
    toArray(),
    map((list) => {
      if (!list.length) throw new RaidenError(ErrorCodes.PFS_INVALID_INFO);
      return list.sort((a, b) => {
        const dif = a.price.sub(b.price);
        // first, sort by price
        if (dif.lt(0)) return -1;
        else if (dif.gt(0)) return 1;
        // if it's equal, tiebreak on rtt
        else return a.rtt - b.rtt;
      });
    }),
  );
}

/**
 * Pack an IOU for signing or verification
 *
 * @param iou - IOU to be packed
 * @returns Packed IOU as a UInt8Array
 */
export function packIOU(iou: IOU) {
  return concatBytes([
    encode(iou.one_to_n_address, 20),
    encode(iou.chain_id, 32),
    encode(MessageTypeId.IOU, 32),
    encode(iou.sender, 20),
    encode(iou.receiver, 20),
    encode(iou.amount, 32),
    encode(iou.expiration_block, 32),
  ]);
}

/**
 * Sign an IOU with signer
 *
 * @param signer - Signer instance
 * @param iou - IOU to be signed
 * @returns Signed IOU
 */
export async function signIOU(signer: Signer, iou: IOU): Promise<Signed<IOU>> {
  return signer
    .signMessage(packIOU(iou))
    .then((signature) => ({ ...iou, signature: signature as Signature }));
}
