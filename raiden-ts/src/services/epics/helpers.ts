import { BigNumber } from '@ethersproject/bignumber';
import { concat as concatBytes } from '@ethersproject/bytes';
import { Zero } from '@ethersproject/constants';
import { toUtf8Bytes } from '@ethersproject/strings';
import { verifyMessage } from '@ethersproject/wallet';
import { Decimal } from 'decimal.js';
import type { Observable } from 'rxjs';
import { defer, from, of } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import { first, map, mergeMap, pluck, timeout, withLatestFrom } from 'rxjs/operators';

import type { Channel } from '../../channels/state';
import { ChannelState } from '../../channels/state';
import { channelAmounts, channelKey } from '../../channels/utils';
import type { RaidenConfig } from '../../config';
import { intervalFromConfig } from '../../config';
import { Capabilities } from '../../constants';
import type { RaidenState } from '../../state';
import type { matrixPresence } from '../../transport/actions';
import { getCap } from '../../transport/utils';
import type { Latest, RaidenEpicDeps } from '../../types';
import { jsonParse, jsonStringify } from '../../utils/data';
import { assert, ErrorCodes, networkErrors, RaidenError } from '../../utils/error';
import { lastMap, mergeWith, retryWhile } from '../../utils/rx';
import type { Address, Signature, Signed } from '../../utils/types';
import { decode, Int, UInt } from '../../utils/types';
import { iouClear, iouPersist, pathFind } from '../actions';
import type { IOU, Paths, PFS } from '../types';
import { LastIOUResults, PathResults, PfsMode } from '../types';
import { packIOU, pfsInfo, pfsListInfo, ServiceError, signIOU } from '../utils';

interface Route {
  iou: Signed<IOU> | undefined;
  paths?: Paths;
  error?: ServiceError;
}

/**
 * Returns a ISO string with millisecond resolution (same as PC)
 *
 * @param time - Date instance
 * @returns string representing time in the format expected by PFS
 */
export function makeTimestamp(time = new Date()): string {
  return time.toISOString().substr(0, 23) + '000';
}

function fetchLastIou$(
  pfs: PFS,
  tokenNetwork: Address,
  { address, signer, network, contractsInfo, latest$, config$ }: RaidenEpicDeps,
): Observable<IOU> {
  return defer(() => {
    const timestamp = makeTimestamp(),
      message = concatBytes([address, pfs.address, toUtf8Bytes(timestamp)]);
    return from(signer.signMessage(message) as Promise<Signature>).pipe(
      map((signature) => ({ sender: address, receiver: pfs.address, timestamp, signature })),
    );
  }).pipe(
    withLatestFrom(config$),
    mergeMap(([payload, { httpTimeout }]) =>
      fromFetch(
        `${pfs.url}/api/v1/${tokenNetwork}/payment/iou?${new URLSearchParams(payload).toString()}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
      ).pipe(
        timeout(httpTimeout),
        retryWhile(intervalFromConfig(config$), { onErrors: [...networkErrors, 'TimeoutError'] }),
      ),
    ),
    withLatestFrom(latest$.pipe(pluck('state', 'blockNumber')), config$),
    mergeMap(async ([response, blockNumber, { pfsIouTimeout }]) => {
      if (response.status === 404) {
        return {
          sender: address,
          receiver: pfs.address,
          chain_id: BigNumber.from(network.chainId) as UInt<32>,
          amount: Zero as UInt<32>,
          one_to_n_address: contractsInfo.OneToN.address,
          expiration_block: BigNumber.from(blockNumber).add(pfsIouTimeout) as UInt<32>,
        }; // return empty/zeroed IOU, but with valid new expiration_block
      }
      const text = await response.text();
      if (!response.ok)
        throw new RaidenError(ErrorCodes.PFS_LAST_IOU_REQUEST_FAILED, {
          responseStatus: response.status,
          responseText: text,
        });

      const { last_iou: lastIou } = decode(LastIOUResults, jsonParse(text));
      // accept last IOU only if it was signed by us
      const signer = verifyMessage(packIOU(lastIou), lastIou.signature);
      if (signer !== address)
        throw new RaidenError(ErrorCodes.PFS_IOU_SIGNATURE_MISMATCH, {
          signer,
          address,
        });
      return lastIou;
    }),
  );
}

function prepareNextIOU$(
  pfs: PFS,
  tokenNetwork: Address,
  deps: RaidenEpicDeps,
): Observable<Signed<IOU> | undefined> {
  if (pfs.price.isZero()) return of(undefined);
  return deps.latest$.pipe(
    first(),
    mergeMap(({ state }) => {
      const cachedIOU = state.iou[tokenNetwork]?.[pfs.address];
      return cachedIOU ? of(cachedIOU) : fetchLastIou$(pfs, tokenNetwork, deps);
    }),
    // increment lastIou by pfs.price; don't touch expiration_block, PFS doesn't like it getting
    // updated and will give an error asking to update previous IOU instead of creating a new one
    map((iou) => ({ ...iou, amount: iou.amount.add(pfs.price) as UInt<32> })),
    mergeMap((iou) => signIOU(deps.signer, iou)),
  );
}

/**
 * Either returns true if given channel can route a payment, or a reason as string if not
 *
 * @param channel - Channel to check
 * @param value - amount of tokens to check if channel can route
 * @returns true if channel can route, string containing reason if not
 */
function channelCanRoute(channel: Channel, value: UInt<32>): true | string {
  const partner = channel.partner.address;
  if (channel.state !== ChannelState.open)
    return `path: channel with "${partner}" in state "${channel.state}" instead of "${ChannelState.open}"`;
  const { ownCapacity: capacity } = channelAmounts(channel);
  if (capacity.lt(value))
    return `path: channel with "${partner}" doesn't have enough capacity=${capacity.toString()}`;
  return true;
}

/**
 * Either returns true if partner can route a payment, or a reason as string if not
 *
 * @param channel - current Channel state, or undefined
 * @param partnerPresence - possibly a partner on given tokenNetwork
 * @param direct - Whether this is a direct transfer or mediated one
 * @param value - amount of tokens to check if channel can route
 * @returns true if channel can route, string containing reason if not
 */
function partnerCanRoute(
  channel: Channel | undefined,
  partnerPresence: matrixPresence.success | undefined,
  direct: boolean,
  value: UInt<32>,
): true | string {
  if (!partnerPresence?.payload.available) return `path: partner not available in transport`;
  const partner = partnerPresence.meta.address;
  if (!direct && !getCap(partnerPresence.payload.caps, Capabilities.MEDIATE))
    return `path: partner "${partner}" doesn't mediate transfers`;
  if (!channel) return `path: there's no direct channel with partner "${partner}"`;
  return channelCanRoute(channel, value);
}

function validateRouteTarget(
  action: pathFind.request,
  state: RaidenState,
  targetPresence: matrixPresence.success,
): void {
  const { tokenNetwork, target, value } = action.meta;

  assert(Object.values(state.tokens).includes(tokenNetwork), [
    ErrorCodes.PFS_UNKNOWN_TOKEN_NETWORK,
    { tokenNetwork },
  ]);

  assert(targetPresence.payload.available, [ErrorCodes.PFS_TARGET_OFFLINE, { target }]);

  assert(getCap(targetPresence.payload.caps, Capabilities.RECEIVE), [
    ErrorCodes.PFS_TARGET_NO_RECEIVE,
    { target },
  ]);

  assert(
    Object.values(state.channels).some((channel) => channelCanRoute(channel, value) === true),
    ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES,
  );
}

function pfsIsDisabled(action: pathFind.request, config: Pick<RaidenConfig, 'pfsMode'>): boolean {
  const disabledByAction = action.payload.pfs === null;
  const disabledByConfig = !action.payload.pfs && config.pfsMode === PfsMode.disabled;
  return disabledByAction || disabledByConfig;
}

function getRouteFromPfs$(action: pathFind.request, deps: RaidenEpicDeps): Observable<Route> {
  return deps.config$.pipe(
    first(),
    mergeWith((config) => getPfsInfo$(action.payload.pfs, config, deps)),
    mergeWith(([, pfs]) => prepareNextIOU$(pfs, action.meta.tokenNetwork, deps)),
    mergeWith(([[config, pfs], iou]) =>
      requestPfs$(pfs, iou, action.meta, { address: deps.address, config }),
    ),
    map(([[[config], iou], { response, text }]) => {
      // any decode error here will throw early and end up in catchError
      const data = jsonParse(text);

      if (!response.ok) {
        const error = decode(ServiceError, data);
        return { iou, error };
      }
      return { iou, paths: parsePfsResponse(action.meta.value, data, config) };
    }),
  );
}

function filterPaths(
  state: RaidenState,
  action: pathFind.request,
  { address, log }: RaidenEpicDeps,
  paths: Paths,
): Paths {
  const filteredPaths: Paths = [];
  const invalidatedRecipients = new Set<Address>();

  for (const { path, fee } of paths) {
    const cleanPath = getCleanPath(path, address);
    const recipient = cleanPath[0];
    if (invalidatedRecipients.has(recipient)) continue;

    let shouldSelectPath = false;
    let reasonToNotSelect = '';
    if (!filteredPaths.length) {
      const channel =
        state.channels[channelKey({ tokenNetwork: action.meta.tokenNetwork, partner: recipient })];
      const partnerCanRoutePossible = channel
        ? channelCanRoute(channel, action.meta.value)
        : `path: there's no direct channel with partner "${recipient}"`;
      if (partnerCanRoutePossible === true) shouldSelectPath = true;
      else reasonToNotSelect = partnerCanRoutePossible;
    } else if (recipient !== filteredPaths[0].path[0]) {
      reasonToNotSelect = 'path: already selected another recipient';
    } else if (fee.gt(filteredPaths[0].fee)) {
      reasonToNotSelect = 'path: already selected a smaller fee';
    } else shouldSelectPath = true;

    if (shouldSelectPath) {
      filteredPaths.push({ path: cleanPath, fee });
    } else {
      log.warn('Invalidated received route. Reason:', reasonToNotSelect, 'Route:', cleanPath);
      invalidatedRecipients.add(recipient);
    }
  }

  return filteredPaths;
}

function getPfsInfo$(
  pfsByAction: pathFind.request['payload']['pfs'],
  config: Pick<RaidenConfig, 'pfsMode' | 'additionalServices'>,
  deps: RaidenEpicDeps,
): Observable<PFS> {
  if (pfsByAction) return of(pfsByAction);
  else if (config.pfsMode === PfsMode.onlyAdditional)
    return defer(async () => {
      let firstErr;
      for (const pfsUrlOrAddr of config.additionalServices) {
        try {
          return await pfsInfo(pfsUrlOrAddr, deps);
        } catch (e) {
          if (!firstErr) firstErr = e;
        }
      }
      throw firstErr;
    });
  else {
    const { log, latest$, init$ } = deps;
    return init$.pipe(
      lastMap(() => latest$.pipe(first(), pluck('state', 'services'))),
      // fetch pfsInfo from whole list & sort it
      mergeMap((services) =>
        pfsListInfo(config.additionalServices.concat(Object.keys(services)), deps).pipe(
          map((pfsInfos) => {
            log.info('Auto-selecting best PFS from:', pfsInfos);
            assert(pfsInfos.length, [
              ErrorCodes.PFS_INVALID_INFO,
              {
                services: Object.keys(services).join(','),
                additionalServices: config.additionalServices.join(','),
              },
            ]);
            return pfsInfos[0]; // pop best ranked
          }),
        ),
      ),
    );
  }
}

function requestPfs$(
  pfs: PFS,
  iou: Signed<IOU> | undefined,
  { tokenNetwork, target, value }: pathFind.request['meta'],
  { address, config }: { address: Address; config: RaidenConfig },
): Observable<{ response: Response; text: string }> {
  const { httpTimeout, pfsMaxPaths } = config;
  const body = jsonStringify({
    from: address,
    to: target,
    value: UInt(32).encode(value),
    max_paths: pfsMaxPaths,
    iou: iou
      ? {
          ...iou,
          amount: UInt(32).encode(iou.amount),
          expiration_block: UInt(32).encode(iou.expiration_block),
          chain_id: UInt(32).encode(iou.chain_id),
        }
      : undefined,
  });

  return fromFetch(`${pfs.url}/api/v1/${tokenNetwork}/paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).pipe(
    timeout(httpTimeout),
    retryWhile(intervalFromConfig(of(config)), {
      onErrors: [...networkErrors, 'TimeoutError'],
    }),
    mergeMap(async (response) => ({ response, text: await response.text() })),
  );
}

function addFeeSafetyMargin(
  fee: Int<32>,
  amount: UInt<32>,
  { pfsSafetyMargin }: Pick<RaidenConfig, 'pfsSafetyMargin'>,
): Int<32> {
  let feeMarginMultiplier = 0.0;
  let amountMultiplier = 0.0;
  if (typeof pfsSafetyMargin === 'number') {
    // legacy: receive feeMultiplier directly, e.g. 1.1 = +10%
    feeMarginMultiplier = pfsSafetyMargin - 1.0;
  } else {
    feeMarginMultiplier = pfsSafetyMargin[0];
    amountMultiplier = pfsSafetyMargin[1];
  }
  const feeMargin = new Decimal(fee.toHexString())
    .abs()
    .mul(feeMarginMultiplier)
    .add(new Decimal(amount.toHexString()).mul(amountMultiplier));
  return decode(
    Int(32),
    // fee += abs(estimatedFee) * feeMarginMultiplier + amount * amountMultiplier
    fee.add(feeMargin.toFixed(0, Decimal.ROUND_CEIL)),
  );
}

function parsePfsResponse(amount: UInt<32>, data: unknown, config: RaidenConfig) {
  // decode results and cap also client-side for pfsMaxPaths
  const results = decode(PathResults, data).result.slice(0, config.pfsMaxPaths);
  return results.map(({ path, estimated_fee }) => {
    let fee;
    if (estimated_fee.isZero()) fee = estimated_fee;
    // add fee margins iff estimated_fee is not zero
    else {
      fee = addFeeSafetyMargin(estimated_fee, amount, config);
    }
    return { path, fee } as const;
  });
}

function shouldPersistIou(route: Route): boolean {
  const { paths, error } = route;
  return paths !== undefined || isNoRouteFoundError(error);
}

function getCleanPath(path: readonly Address[], address: Address): readonly Address[] {
  if (path[0] === address) {
    return path.slice(1);
  } else {
    return path;
  }
}

function isNoRouteFoundError(error: ServiceError | undefined): boolean {
  return error?.error_code === 2201;
}

/**
 * @param action - pfs request action
 * @param deps - Epics dependencies
 * @param latest - Latest object
 * @param latest.state - Latest state
 * @param latest.config - Latest config
 * @param targetPresence - Current presence of target
 * @returns Observable containing paths, new iou or error
 */
export function getRoute$(
  action: pathFind.request,
  deps: RaidenEpicDeps,
  { state, config }: Pick<Latest, 'state' | 'config'>,
  targetPresence: matrixPresence.success,
): Observable<{ paths?: Paths; iou: Signed<IOU> | undefined; error?: ServiceError }> {
  validateRouteTarget(action, state, targetPresence);

  const { tokenNetwork, target, value } = action.meta;

  if (action.payload.paths) {
    return of({ paths: action.payload.paths, iou: undefined });
  } else if (
    partnerCanRoute(
      state.channels[channelKey({ tokenNetwork, partner: target })],
      targetPresence,
      true,
      value,
    ) === true
  ) {
    return of({
      paths: [{ path: [deps.address, target], fee: Zero as Int<32> }],
      iou: undefined,
    });
  } else if (pfsIsDisabled(action, config)) {
    throw new RaidenError(ErrorCodes.PFS_DISABLED);
  } else {
    return getRouteFromPfs$(action, deps);
  }
}

/**
 * @param state - Latest RaidenState
 * @param action - pfs request action
 * @param deps - Epics dependencies
 * @param route - Received route to validate
 * @returns Observable of results actions after route is validated
 */
export function validateRoute$(
  state: RaidenState,
  action: pathFind.request,
  deps: RaidenEpicDeps,
  route: Route,
): Observable<pathFind.success | pathFind.failure | iouPersist | iouClear> {
  const { tokenNetwork } = action.meta;
  const { iou, paths, error } = route;

  return from(
    // looks like mergeMap with generator doesn't handle exceptions correctly
    // use from+iterator from iife generator instead
    (function* () {
      if (iou) {
        if (shouldPersistIou(route)) {
          yield iouPersist({ iou }, { tokenNetwork: tokenNetwork, serviceAddress: iou.receiver });
        } else {
          yield iouClear(undefined, {
            tokenNetwork: tokenNetwork,
            serviceAddress: iou.receiver,
          });
        }
      }

      if (error) {
        if (isNoRouteFoundError(error)) {
          throw new RaidenError(ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES);
        } else {
          throw new RaidenError(ErrorCodes.PFS_ERROR_RESPONSE, {
            errorCode: error.error_code,
            errors: error.errors,
          });
        }
      }

      const filteredPaths = paths ? filterPaths(state, action, deps, paths) : [];

      if (filteredPaths.length) {
        yield pathFind.success({ paths: filteredPaths }, action.meta);
      } else {
        throw new RaidenError(ErrorCodes.PFS_NO_ROUTES_FOUND);
      }
    })(),
  );
}
