import type { Signer } from '@ethersproject/abstract-signer';
import { concat as concatBytes } from '@ethersproject/bytes';
import * as t from 'io-ts';
import memoize from 'lodash/memoize';
import uniqBy from 'lodash/uniqBy';
import type { Observable } from 'rxjs';
import { defer, EMPTY, firstValueFrom, from } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import { catchError, map, mergeMap, toArray } from 'rxjs/operators';

import type { ServiceRegistry } from '../contracts';
import { AddressMetadata } from '../messages/types';
import { MessageTypeId, validateAddressMetadata } from '../messages/utils';
import type { matrixPresence } from '../transport/actions';
import type { RaidenEpicDeps } from '../types';
import { encode, jsonParse } from '../utils/data';
import { assert, ErrorCodes, networkErrors, RaidenError } from '../utils/error';
import { LruCache } from '../utils/lru';
import { retryAsync$ } from '../utils/rx';
import type { Signature, Signed } from '../utils/types';
import { Address, decode, UInt } from '../utils/types';
import type { IOU, PFS } from './types';

const serviceRegistryToken = memoize(
  async (serviceRegistryContract: ServiceRegistry, pollingInterval: number) =>
    firstValueFrom(
      retryAsync$(
        async () => serviceRegistryContract.callStatic.token() as Promise<Address>,
        pollingInterval,
        { onErrors: networkErrors },
      ),
    ),
);

/**
 * Fetch, validate and cache the service URL for a given URL or service address
 * (if registered on ServiceRegistry)
 *
 * @param pfsAddressUrl - service Address or URL
 * @returns Promise to validated URL
 */
const pfsAddressUrl = memoize(async function pfsAddressUrl_(
  pfsAddrOrUrl: string,
  { serviceRegistryContract }: Pick<RaidenEpicDeps, 'serviceRegistryContract'>,
): Promise<string> {
  let url = pfsAddrOrUrl;
  if (Address.is(pfsAddrOrUrl)) url = await serviceRegistryContract.callStatic.urls(pfsAddrOrUrl);
  return validatePfsUrl(url);
});

const urlRegex =
  process.env.NODE_ENV === 'production'
    ? /^(?:https:\/\/)?[^\s\/$.?#&"']+\.[^\s\/$?#&"']+$/
    : /^(?:(http|https):\/\/)?([^\s\/$.?#&"']+\.)*[^\s\/$?#&"']+(?:(\d+))*$/;

function validatePfsUrl(url: string) {
  assert(url, ErrorCodes.PFS_EMPTY_URL);
  assert(urlRegex.test(url), [ErrorCodes.PFS_INVALID_URL, { url }]);
  // default to https for schema-less urls
  if (!url.match(/^https?:\/\//)) url = `https://${url}`;
  return url;
}

const pfsAddressCache_ = new LruCache<string, Promise<Address>>(32);

/** Codec for PFS API returned error */
export const ServiceError = t.readonly(
  t.intersection([
    t.type({
      error_code: t.number,
      errors: t.string,
    }),
    t.partial({ error_details: t.record(t.string, t.unknown) }),
  ]),
);
export type ServiceError = t.TypeOf<typeof ServiceError>;

/**
 * Returns a cold observable which fetch PFS info & validate for a given server address or URL
 *
 * This is a memoized function which caches by url or address, network and registry used.
 *
 * @param pfsAddrOrUrl - PFS account/address or URL
 * @param deps - RaidenEpicDeps needed for various parameters
 * @param deps.serviceRegistryContract - ServiceRegistry contract instance
 * @param deps.network - Current Network
 * @param deps.contractsInfo - ContractsInfo mapping
 * @param deps.config$ - Config observable
 * @param deps.provider - Eth provider
 * @returns Promise containing PFS server info
 */
export async function pfsInfo(
  pfsAddrOrUrl: Address | string,
  {
    serviceRegistryContract,
    network,
    contractsInfo,
    provider,
    config$,
  }: Pick<
    RaidenEpicDeps,
    'serviceRegistryContract' | 'network' | 'contractsInfo' | 'provider' | 'config$'
  >,
): Promise<PFS> {
  const { pfsMaxFee } = await firstValueFrom(config$);
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
  const url = await pfsAddressUrl(pfsAddrOrUrl, { serviceRegistryContract });

  const start = Date.now();
  const res = await fetch(url + '/api/v1/info', { mode: 'cors' });
  const text = await res.text();
  assert(res.ok, [ErrorCodes.PFS_ERROR_RESPONSE, { text }]);
  const info = decode(PathInfo, jsonParse(text));

  assert(info.price_info.lte(pfsMaxFee), [
    ErrorCodes.PFS_TOO_EXPENSIVE,
    { price: info.price_info.toString() },
  ]);
  pfsAddressCache_.set(url, Promise.resolve(info.payment_address));

  return {
    address: info.payment_address,
    url,
    rtt: Date.now() - start,
    price: info.price_info,
    token: await serviceRegistryToken(serviceRegistryContract, provider.pollingInterval),
  };
}

/**
 * Returns the address for the PFS/service with the given URL.
 * Result is cached and this cache is shared with [[pfsInfo]] calls.
 *
 * @param url - Url of the PFS to retrieve address for
 * @param deps - Epics dependencies (for pfsInfo)
 * @returns Promise to Address of PFS on given URL
 */
export const pfsInfoAddress = Object.assign(
  async function pfsInfoAddress(
    url: string,
    deps: Pick<
      RaidenEpicDeps,
      'serviceRegistryContract' | 'network' | 'contractsInfo' | 'provider' | 'config$'
    >,
  ): Promise<Address> {
    url = validatePfsUrl(url);
    let addrPromise = pfsAddressCache_.get(url);
    if (!addrPromise) {
      // since the url is already validated, this will always set the cache, even if to the promise
      // which will be rejected on '/info' request/validation
      addrPromise = pfsInfo(url, deps).then(({ address }) => address);
      pfsAddressCache_.set(url, addrPromise);
    }
    return addrPromise;
  },
  { cache: pfsAddressCache_ },
);

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
  deps: Pick<
    RaidenEpicDeps,
    'log' | 'serviceRegistryContract' | 'network' | 'contractsInfo' | 'provider' | 'config$'
  >,
): Observable<PFS[]> {
  const { log } = deps;
  return from(pfsList).pipe(
    mergeMap(function (addrOrUrl) {
      return defer(async () => pfsInfo(addrOrUrl, deps)).pipe(
        catchError((err) => {
          log.warn(`Error trying to fetch PFS info for "${addrOrUrl}" - ignoring:`, err);
          return EMPTY;
        }),
      );
    }, 5),
    toArray(),
    map((list) => {
      assert(list.length || !pfsList.length, ErrorCodes.PFS_INVALID_INFO);
      return uniqBy(list, 'url').sort((a, b) => {
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
 * @param address - Peer address to fetch presence for
 * @param pfsAddrOrUrl - PFS/service address to fetch presence from
 * @param deps - Epics dependencies subset
 * @param deps.serviceRegistryContract - Contract instance
 * @returns Observable to peer's presence or error
 */
export function getPresenceFromService$(
  address: Address,
  pfsAddrOrUrl: string,
  deps: Pick<RaidenEpicDeps, 'serviceRegistryContract' | 'log'>,
): Observable<matrixPresence.success> {
  const { serviceRegistryContract } = deps;
  return defer(async () => pfsAddressUrl(pfsAddrOrUrl, { serviceRegistryContract })).pipe(
    mergeMap((url) => fromFetch(`${url}/api/v1/address/${address}/metadata`)),
    mergeMap(async (res) => res.json()),
    map((json) => {
      try {
        const metadata = decode(AddressMetadata, json);
        const presence = validateAddressMetadata(metadata, address, deps);
        assert(presence, ['Invalid metadata signature', { peer: address, presence: metadata }]);
        assert(presence.payload.caps, ['Invalid capabilities format', metadata.capabilities]);
        return presence;
      } catch (err) {
        try {
          const { errors: msg, ...details } = decode(ServiceError, json);
          err = new RaidenError(msg, details);
        } catch (e) {}
        throw err;
      }
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
