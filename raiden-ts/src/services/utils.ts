import type { Signer } from '@ethersproject/abstract-signer';
import { arrayify, concat as concatBytes } from '@ethersproject/bytes';
import { hashMessage } from '@ethersproject/hash';
import { recoverPublicKey } from '@ethersproject/signing-key';
import { computeAddress } from '@ethersproject/transactions';
import * as t from 'io-ts';
import memoize from 'lodash/memoize';
import uniqBy from 'lodash/uniqBy';
import type { Observable } from 'rxjs';
import { defer, EMPTY, firstValueFrom, from, of } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import {
  catchError,
  concatMap,
  delay,
  first,
  last,
  map,
  mergeAll,
  mergeMap,
  takeUntil,
  tap,
  throwIfEmpty,
  toArray,
} from 'rxjs/operators';

import type { ServiceRegistry } from '../contracts';
import { MessageTypeId } from '../messages/utils';
import { matrixPresence } from '../transport/actions';
import { parseCaps } from '../transport/utils';
import type { RaidenEpicDeps } from '../types';
import { encode, jsonParse } from '../utils/data';
import { assert, ErrorCodes, networkErrors, RaidenError } from '../utils/error';
import { LruCache } from '../utils/lru';
import { pluckDistinct, retryAsync$ } from '../utils/rx';
import type { PublicKey, Signature, Signed } from '../utils/types';
import { Address, decode, UInt } from '../utils/types';
import type { pathFind } from './actions';
import type { IOU, PFS } from './types';
import { AddressMetadata, PfsError, PfsMode } from './types';

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
  process.env['NODE_ENV'] === 'production'
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

/**
 * Fetch PFS info & validate for a given server address or URL
 *
 * This is a memoized function which caches by url or address, network and registry used.
 *
 * @param pfsAddrOrUrl - PFS account/address or URL
 * @param deps - RaidenEpicDeps needed for various parameters
 * @param deps.log - Logger instance
 * @param deps.serviceRegistryContract - ServiceRegistry contract instance
 * @param deps.network - Current Network
 * @param deps.contractsInfo - ContractsInfo mapping
 * @param deps.provider - Eth provider
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Promise containing PFS server info
 */
export async function pfsInfo(
  pfsAddrOrUrl: Address | string,
  {
    log,
    serviceRegistryContract,
    network,
    contractsInfo,
    provider,
    config$,
    latest$,
  }: Pick<
    RaidenEpicDeps,
    | 'log'
    | 'serviceRegistryContract'
    | 'network'
    | 'contractsInfo'
    | 'provider'
    | 'config$'
    | 'latest$'
  >,
): Promise<PFS> {
  const { pfsMaxFee } = await firstValueFrom(config$);
  const { state } = await firstValueFrom(latest$);
  const { services } = state;
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

  try {
    // if it's an address, fetch url from ServiceRegistry, else it's already the URL
    const url = await pfsAddressUrl(pfsAddrOrUrl, { serviceRegistryContract });

    const start = Date.now();
    const res = await fetch(url + '/api/v1/info', { mode: 'cors' });
    const rtt = Date.now() - start;
    const text = await res.text();
    assert(res.ok, [ErrorCodes.PFS_ERROR_RESPONSE, { text }]);
    const info = decode(PathInfo, jsonParse(text));

    const { payment_address: address, price_info: price } = info;
    assert(price.lte(pfsMaxFee), [ErrorCodes.PFS_TOO_EXPENSIVE, { price }]);
    pfsAddressCache_.set(url, Promise.resolve(info.payment_address));
    const validTill =
      services[address] ??
      (await serviceRegistryContract.callStatic.service_valid_till(address)).toNumber() * 1e3;

    return {
      address,
      url,
      rtt,
      price,
      token: await serviceRegistryToken(serviceRegistryContract, provider.pollingInterval),
      validTill,
    };
  } catch (err) {
    log.warn('Error fetching PFS info:', pfsAddrOrUrl, err);
    throw err;
  }
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
      | 'log'
      | 'serviceRegistryContract'
      | 'network'
      | 'contractsInfo'
      | 'provider'
      | 'config$'
      | 'latest$'
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
    | 'log'
    | 'serviceRegistryContract'
    | 'network'
    | 'contractsInfo'
    | 'provider'
    | 'config$'
    | 'latest$'
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
 * @param metadata - to convert to presence
 * @returns presence for metadata, assuming node is available
 */
function metadataToPresence(metadata: AddressMetadata): matrixPresence.success {
  const pubkey = recoverPublicKey(
    arrayify(hashMessage(metadata.user_id)),
    metadata.displayname,
  ) as PublicKey;
  const address = computeAddress(pubkey) as Address;
  return matrixPresence.success(
    {
      userId: metadata.user_id,
      available: true,
      ts: Date.now(),
      caps: parseCaps(metadata.capabilities),
      pubkey,
    },
    { address },
  );
}

/**
 * Validates metadata was signed by address
 *
 * @param metadata - Peer's metadata
 * @param address - Peer's address
 * @param opts - Options
 * @param opts.log - Logger instance
 * @returns presence iff metadata is valid and was signed by address
 */
export function validateAddressMetadata(
  metadata: AddressMetadata | undefined,
  address: Address,
  { log }: Partial<Pick<RaidenEpicDeps, 'log'>> = {},
): matrixPresence.success | undefined {
  if (!metadata) return;
  try {
    const presence = metadataToPresence(metadata);
    assert(presence.meta.address === address, [
      'Wrong signature',
      { expected: address, recovered: presence.meta.address },
    ]);
    return presence;
  } catch (error) {
    log?.warn('Invalid address metadata', { address, metadata, error });
  }
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
  return defer(async () => pfsAddressUrl(pfsAddrOrUrl, deps)).pipe(
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
          const { errors: msg, ...details } = decode(PfsError, json);
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
    encode(iou.claimable_until, 32),
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

/**
 * Choose best PFS and fetch info from it
 *
 * @param pfsByAction - Override config for this call: explicit PFS, disabled or undefined
 * @param deps - Epics dependencies
 * @returns Observable to choosen PFS
 */
export function choosePfs$(
  pfsByAction: pathFind.request['payload']['pfs'],
  deps: RaidenEpicDeps,
): Observable<PFS> {
  const { log, config$, latest$, init$ } = deps;
  return config$.pipe(
    first(),
    mergeMap(({ pfsMode, additionalServices }) => {
      if (pfsByAction) return of(pfsByAction);
      else if (pfsMode === PfsMode.onlyAdditional) {
        let firstError: Error;
        return from(additionalServices).pipe(
          concatMap((service) =>
            defer(async () => pfsInfo(service, deps)).pipe(
              catchError((e) => ((firstError ??= e), EMPTY)),
            ),
          ),
          throwIfEmpty(() => firstError),
        );
      } else {
        return latest$.pipe(
          pluckDistinct('state', 'services'),
          map((services) => [...additionalServices, ...Object.keys(services)]),
          // takeUntil above first will error if, after init$ and concatenating additionalServices,
          // we still could not find a valid service
          takeUntil(init$.pipe(last(), delay(10))),
          first((services) => services.length > 0),
          // fetch pfsInfo from whole list & sort it
          mergeMap((services) => pfsListInfo(services, deps)),
          mergeAll(),
        );
      }
    }),
    tap((pfs) => {
      if (pfs.validTill < Date.now()) {
        log.warn(
          'WARNING: PFS registration not valid! This service deposit may have expired and it may not receive network updates anymore.',
          pfs,
        );
      }
    }),
  );
}
