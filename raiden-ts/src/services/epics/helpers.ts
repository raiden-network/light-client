import { BigNumber } from '@ethersproject/bignumber';
import { concat as concatBytes } from '@ethersproject/bytes';
import { Zero } from '@ethersproject/constants';
import { toUtf8Bytes } from '@ethersproject/strings';
import { verifyMessage } from '@ethersproject/wallet';
import BN from 'bignumber.js';
import * as t from 'io-ts';
import type { Observable } from 'rxjs';
import { defer, from, of } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import {
  filter,
  first,
  map,
  mergeMap,
  pluck,
  take,
  timeout,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import type { RaidenConfig } from '../../config';
import { intervalFromConfig } from '../../config';
import { Capabilities } from '../../constants';
import type { RaidenState } from '../../state';
import { matrixPresence } from '../../transport/actions';
import type { Presences } from '../../transport/types';
import { getCap } from '../../transport/utils';
import type { Latest, RaidenEpicDeps } from '../../types';
import { isResponseOf } from '../../utils/actions';
import { jsonParse, jsonStringify } from '../../utils/data';
import { assert, ErrorCodes, networkErrors, RaidenError } from '../../utils/error';
import { lastMap, mergeWith, retryWhile } from '../../utils/rx';
import type { Address, Signature, Signed } from '../../utils/types';
import { decode, Int, UInt } from '../../utils/types';
import { iouClear, iouPersist, pathFind } from '../actions';
import type { IOU, Paths, PFS } from '../types';
import { LastIOUResults, PathResults, PfsMode } from '../types';
import { channelCanRoute, packIOU, pfsInfo, pfsListInfo, signIOU } from '../utils';

/**
 * Codec for PFS API returned error
 *
 * May contain other fields like error_details, but we don't care about them (for now)
 */
const PathError = t.readonly(
  t.type({
    error_code: t.number,
    errors: t.string,
  }),
);

type PathError = t.TypeOf<typeof PathError>;

interface Route {
  iou: Signed<IOU> | undefined;
  paths?: Paths;
  error?: PathError;
}

/**
 * Returns a ISO string truncated at the integer second resolution
 *
 * @param time - Date instance
 * @returns string representing time in the format expected by PFS
 */
export function makeTimestamp(time?: Date): string {
  return (time ?? new Date()).toISOString().substr(0, 19);
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

function validateRouteTargetAndEventuallyThrow(
  action: pathFind.request,
  state: RaidenState,
  presences: Presences,
): void {
  const { tokenNetwork, target, value } = action.meta;

  assert(Object.values(state.tokens).includes(tokenNetwork), [
    ErrorCodes.PFS_UNKNOWN_TOKEN_NETWORK,
    { tokenNetwork },
  ]);

  assert(presences[target].payload.available, [ErrorCodes.PFS_TARGET_OFFLINE, { target }]);

  assert(getCap(presences[target].payload.caps, Capabilities.RECEIVE), [
    ErrorCodes.PFS_TARGET_NO_RECEIVE,
    { target },
  ]);

  assert(
    Object.values(state.channels).some(
      (channel) =>
        channelCanRoute(state, presences, tokenNetwork, channel.partner.address, target, value) ===
        true,
    ),
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
        const error = decode(PathError, data);
        return { iou, error };
      }
      return { iou, paths: parsePfsResponse(action.meta.value, data, config) };
    }),
  );
}

function filterPaths(
  action: pathFind.request,
  { address, log }: RaidenEpicDeps,
  { state, presences }: Latest,
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
      const channelCanRoutePossible = channelCanRoute(
        state,
        presences,
        action.meta.tokenNetwork,
        recipient,
        action.meta.target,
        action.meta.value,
      );
      if (channelCanRoutePossible === true) shouldSelectPath = true;
      else reasonToNotSelect = channelCanRoutePossible;
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
  let feeMultiplier = 1.0;
  let amountMultiplier = 0.0;
  if (typeof pfsSafetyMargin === 'number') {
    feeMultiplier = pfsSafetyMargin; // legacy: receive feeMultiplier directly, e.g. 1.1 = +10%
  } else {
    feeMultiplier = pfsSafetyMargin[0] + 1.0; // feeMultiplier = feeMargin% + 100%
    amountMultiplier = pfsSafetyMargin[1];
  }
  return decode(
    Int(32),
    new BN(fee.toHexString())
      .times(feeMultiplier)
      .plus(new BN(amount.toHexString()).times(amountMultiplier))
      .toFixed(0, BN.ROUND_CEIL), // fee = estimatedFee * (feeMultiplier) + amount * amountMultiplier
  );
}

function parsePfsResponse(amount: UInt<32>, data: unknown, config: RaidenConfig) {
  // decode results and cap also client-side for pfsMaxPaths
  const results = decode(PathResults, data).result.slice(0, config.pfsMaxPaths);
  return results.map(({ path, estimated_fee }) => {
    let fee;
    if (estimated_fee.lte(0)) fee = estimated_fee;
    // add fee margins iff estimated_fee is greater than zero
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

function isNoRouteFoundError(error: PathError | undefined): boolean {
  return error?.error_code === 2201;
}

/**
 * Helper function to ensure Latest contains a peer's presence
 *
 * @param action$ - Observable of RaidenActions
 * @param deps - Epics dependencies
 * @param target - Peer's address
 * @returns Observable emitting a Latest object with peers presence in Latest.presences
 */
export function waitForMatrixPresenceResponse$(
  action$: Observable<RaidenAction>,
  deps: RaidenEpicDeps,
  target: Address,
): Observable<Latest> {
  return action$.pipe(
    filter(
      isResponseOf<typeof matrixPresence>(matrixPresence, { address: target }),
    ),
    take(1),
    mergeMap((matrixPresenceResponse) => {
      if (matrixPresence.success.is(matrixPresenceResponse)) {
        return deps.latest$.pipe(first(({ presences }) => target in presences));
      } else {
        throw matrixPresenceResponse.payload;
      }
    }),
  );
}

/**
 * @param action - pfs request action
 * @param deps - Epics dependencies
 * @param latest - Latest object
 * @param latest.state - Latest state
 * @param latest.presences - Latest presences
 * @param latest.config - Latest config
 * @returns Observable containing paths, new iou or error
 */
export function getRoute$(
  action: pathFind.request,
  deps: RaidenEpicDeps,
  { state, presences, config }: Latest,
): Observable<{ paths?: Paths; iou: Signed<IOU> | undefined; error?: PathError }> {
  validateRouteTargetAndEventuallyThrow(action, state, presences);

  const { tokenNetwork, target, value } = action.meta;

  if (action.payload.paths) {
    return of({ paths: action.payload.paths, iou: undefined });
  } else if (channelCanRoute(state, presences, tokenNetwork, target, target, value) === true) {
    return of({
      paths: [{ path: [deps.address, action.meta.target], fee: Zero as Int<32> }],
      iou: undefined,
    });
  } else if (pfsIsDisabled(action, config)) {
    throw new RaidenError(ErrorCodes.PFS_DISABLED);
  } else {
    return getRouteFromPfs$(action, deps);
  }
}

/**
 * @param action - pfs request action
 * @param deps - Epics dependencies
 * @param route - Received route to validate
 * @param latest - Latest object
 * @returns Observable of results actions after route is validated
 */
export function validateRoute$(
  action: pathFind.request,
  deps: RaidenEpicDeps,
  route: Route,
  latest: Latest,
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

      const filteredPaths = paths ? filterPaths(action, deps, latest, paths) : [];

      if (filteredPaths.length) {
        yield pathFind.success({ paths: filteredPaths }, action.meta);
      } else {
        throw new RaidenError(ErrorCodes.PFS_NO_ROUTES_FOUND);
      }
    })(),
  );
}
