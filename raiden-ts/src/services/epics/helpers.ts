import { BigNumber } from '@ethersproject/bignumber';
import { concat as concatBytes } from '@ethersproject/bytes';
import { Zero } from '@ethersproject/constants';
import { toUtf8Bytes } from '@ethersproject/strings';
import { verifyMessage } from '@ethersproject/wallet';
import { Decimal } from 'decimal.js';
import isEmpty from 'lodash/isEmpty';
import omit from 'lodash/omit';
import type { Observable } from 'rxjs';
import { concat, defer, EMPTY, from, of, throwError } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import {
  catchError,
  concatMap,
  first,
  map,
  mergeMap,
  tap,
  timeout,
  toArray,
  withLatestFrom,
} from 'rxjs/operators';

import type { Channel } from '../../channels/state';
import { ChannelState } from '../../channels/state';
import { channelAmounts, channelKey } from '../../channels/utils';
import type { RaidenConfig } from '../../config';
import { intervalFromConfig } from '../../config';
import { Capabilities } from '../../constants';
import type { RaidenState } from '../../state';
import { searchValidMetadata } from '../../transfers/utils';
import type { matrixPresence } from '../../transport/actions';
import { getCap, stringifyCaps } from '../../transport/utils';
import type { Latest, RaidenEpicDeps } from '../../types';
import { jsonParse, jsonStringify } from '../../utils/data';
import { assert, ErrorCodes, networkErrors, RaidenError } from '../../utils/error';
import { retryWhile, withMergeFrom } from '../../utils/rx';
import type { Address, Signature } from '../../utils/types';
import { decode, Signed, UInt } from '../../utils/types';
import { iouClear, iouPersist, pathFind } from '../actions';
import type { AddressMetadataMap, InputPaths, Paths, PFS } from '../types';
import { Fee, IOU, LastIOUResults, PfsError, PfsMode, PfsResult } from '../types';
import { choosePfs$, packIOU, signIOU } from '../utils';

type RouteResult = { iou: Signed<IOU> | undefined } & ({ paths: Paths } | { error: PfsError });

/**
 * Returns a ISO string with millisecond resolution (same as PC)
 *
 * @param time - Date instance
 * @returns string representing time in the format expected by PFS
 */
export function makeTimestamp(time = new Date()): string {
  return time.toISOString().substring(0, 23) + '000';
}

function fetchLastIou$(
  pfs: PFS,
  tokenNetwork: Address,
  { address, log, signer, network, contractsInfo, config$ }: RaidenEpicDeps,
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
    withLatestFrom(config$),
    mergeMap(async ([response, { pfsIouTimeout }]) => {
      if (response.status === 404) {
        const iou = {
          sender: address,
          receiver: pfs.address,
          chain_id: BigNumber.from(network.chainId) as UInt<32>,
          amount: Zero as UInt<32>,
          one_to_n_address: contractsInfo.OneToN.address,
          claimable_until: BigNumber.from(
            Math.round(Date.now() / 1e3 + pfsIouTimeout),
          ) as UInt<32>,
        };
        log.warn('PFS: new IOU created', iou);
        return iou; // return empty/zeroed IOU, but with valid new expiration
      }
      const text = await response.text();
      assert(response.ok, [
        ErrorCodes.PFS_LAST_IOU_REQUEST_FAILED,
        { responseStatus: response.status, responseText: text },
      ]);

      const { last_iou: lastIou } = decode(LastIOUResults, jsonParse(text));
      // accept last IOU only if it was signed by us
      const signer = verifyMessage(packIOU(lastIou), lastIou.signature);
      assert(signer === address, [
        ErrorCodes.PFS_IOU_SIGNATURE_MISMATCH,
        { signer, address, lastIou },
      ]);
      log.warn('PFS: fetched non-cached signed IOU from server', lastIou);
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
    // increment lastIou by pfs.price; don't touch expiration, PFS doesn't like it getting
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
  if (!channel) return `path: there's no direct channel with partner`;
  if (partnerPresence?.payload.available === false)
    return `path: partner not available in transport`;
  if (!direct && !getCap(partnerPresence?.payload.caps, Capabilities.MEDIATE))
    return `path: partner doesn't mediate transfers`;
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

function getRouteFromPfs$(
  action: pathFind.request,
  deps: RaidenEpicDeps,
): Observable<RouteResult> {
  return choosePfs$(action.payload.pfs, deps).pipe(
    first(), // pop first/best PFS
    withMergeFrom((pfs) => prepareNextIOU$(pfs, action.meta.tokenNetwork, deps)),
    withLatestFrom(deps.config$),
    withMergeFrom(([[pfs, iou], config]) =>
      requestPfs$(pfs, iou, action.meta, { address: deps.address, config }),
    ),
    map(([[[, iou], config], { response, text }]) => {
      // any decode error here will throw early and end up in catchError
      const data = jsonParse(text);

      if (!response.ok) {
        const error = decode(PfsError, data, undefined, deps.log.warn);
        return { iou, error };
      }
      return { iou, paths: parsePfsResponse(data, action.meta.value, config) };
    }),
  );
}

function filterPaths$(
  [action, paths]: readonly [action: pathFind.request, paths: Paths],
  state: RaidenState,
  { address, log }: Pick<RaidenEpicDeps, 'address' | 'log'>,
): Observable<Paths> {
  let firstPath: Paths[number] | undefined;
  let firstError: Error | undefined;
  const invalidatedRecipients = new Set<Address>();
  const { tokenNetwork, value, target } = action.meta;

  return from(paths).pipe(
    concatMap((path) => {
      let recipient: Address;
      return defer(() => {
        assert(
          path.path.length >= 2 && path.path[0] === address,
          'we are not the first address in path',
        );
        recipient = path.path[1]!;
        assert(!invalidatedRecipients.has(recipient), 'already invalidated recipient');
        if (firstPath) {
          assert(firstPath.path[1] === recipient, 'already selected another recipient');
          assert(firstPath.fee.gte(path.fee), 'already selected a smaller fee');
        } else {
          const channel = state.channels[channelKey({ tokenNetwork, partner: recipient })];
          const partnerPresence = searchValidMetadata(path.address_metadata, recipient);
          const partnerCanRoutePossible = partnerCanRoute(
            channel,
            partnerPresence,
            target === recipient,
            value,
          );
          if (partnerCanRoutePossible !== true)
            throw new RaidenError(partnerCanRoutePossible, { partnerPresence, channel });
          for (const [idx, hop] of Object.entries(path.path.slice(2, -1))) {
            const presence = searchValidMetadata(path.address_metadata, hop);
            assert(getCap(presence?.payload.caps, Capabilities.MEDIATE), [
              "path: hop doesn't mediate transfers",
              { hopIndex: idx + 2, hop, hopPresence: presence },
            ]);
          }
        }
        return of(path);
      }).pipe(
        tap((path) => (firstPath ??= path)),
        catchError((error) => {
          firstError ??= error;
          log.warn('Invalidated received route', { error, path });
          if (recipient) invalidatedRecipients.add(recipient);
          return EMPTY;
        }),
      );
    }),
    toArray(),
    map((paths) => {
      if (!paths.length) throw firstError ?? new RaidenError(ErrorCodes.PFS_NO_ROUTES_FOUND);
      return paths;
    }),
  );
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
    iou: iou ? Signed(IOU).encode(iou) : undefined,
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
  fee: Fee,
  amount: UInt<32>,
  { pfsSafetyMargin }: Pick<RaidenConfig, 'pfsSafetyMargin'>,
): Fee {
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
    Fee,
    // fee += abs(estimatedFee) * feeMarginMultiplier + amount * amountMultiplier
    fee.add(feeMargin.toFixed(0, Decimal.ROUND_CEIL)),
  );
}

// map a generic InputPaths to a specific Paths (see docstring of the types)
function inputToPaths(inputPaths: InputPaths, amount: UInt<32>, config: RaidenConfig): Paths {
  return inputPaths.map((input) => {
    const path = 'path' in input ? input.path : input.route;
    const rest1 = omit(input, ['path', 'route']);
    const fee =
      'fee' in input
        ? input.fee
        : input.estimated_fee.isZero()
        ? input.estimated_fee
        : addFeeSafetyMargin(input.estimated_fee, amount, config);
    const rest2 = omit(rest1, ['fee', 'estimated_fee']);
    return { path, fee, ...rest2 };
  });
}

function parsePfsResponse(data: unknown, amount: UInt<32>, config: RaidenConfig): Paths {
  // decode results and cap also client-side for pfsMaxPaths
  return inputToPaths(decode(PfsResult, data).result, amount, config).slice(0, config.pfsMaxPaths);
}

function shouldPersistIou(route: RouteResult): boolean {
  return 'paths' in route || isNoRouteFoundError(route.error);
}

function isNoRouteFoundError(error: PfsError | undefined): boolean {
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
): Observable<RouteResult> {
  validateRouteTarget(action, state, targetPresence);

  const { tokenNetwork, target, value } = action.meta;

  if (action.payload.paths) {
    return of({ paths: inputToPaths(action.payload.paths, value, config), iou: undefined });
  } else if (
    partnerCanRoute(
      state.channels[channelKey({ tokenNetwork, partner: target })],
      targetPresence,
      true,
      value,
    ) === true
  ) {
    const addressMetadata: Mutable<AddressMetadataMap> = {};
    if (state.transport.setup) {
      addressMetadata[deps.address] = {
        user_id: state.transport.setup.userId,
        displayname: state.transport.setup.displayName,
        capabilities: stringifyCaps(config.caps ?? {}),
      };
    }
    return of({
      paths: [
        {
          path: [deps.address, target],
          fee: Zero as Fee,
          ...(!isEmpty(addressMetadata) ? { address_metadata: addressMetadata } : {}),
        },
      ],
      iou: undefined,
    });
  } else if (pfsIsDisabled(action, config)) {
    throw new RaidenError(ErrorCodes.PFS_DISABLED);
  } else {
    return getRouteFromPfs$(action, deps);
  }
}

/**
 * @param opts - validation options
 * @param opts."0" - pfs request action
 * @param opts."1" - Received route to validate
 * @param state - Latest RaidenState
 * @param deps - Epics dependencies
 * @returns Observable of results actions after route is validated
 */
export function validateRoute$(
  [action, route]: readonly [action: pathFind.request, route: RouteResult],
  state: RaidenState,
  deps: RaidenEpicDeps,
): Observable<pathFind.success | iouPersist | iouClear> {
  const { tokenNetwork } = action.meta;
  const { iou } = route;

  let iou$: Observable<iouPersist | iouClear> = EMPTY;
  if (iou) {
    iou$ = of(
      shouldPersistIou(route)
        ? iouPersist({ iou }, { tokenNetwork: tokenNetwork, serviceAddress: iou.receiver })
        : iouClear(undefined, {
            tokenNetwork: tokenNetwork,
            serviceAddress: iou.receiver,
          }),
    );
  }
  let result$: Observable<pathFind.success>;
  if ('error' in route) {
    const { error } = route;
    result$ = throwError(() =>
      isNoRouteFoundError(error)
        ? new RaidenError(ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES)
        : new RaidenError(ErrorCodes.PFS_ERROR_RESPONSE, {
            errorCode: error.error_code,
            errors: error.errors,
          }),
    );
  } else {
    result$ = filterPaths$([action, route.paths], state, deps).pipe(
      map((paths) => pathFind.success({ paths }, action.meta)),
    );
  }
  return concat(iou$, result$);
}
