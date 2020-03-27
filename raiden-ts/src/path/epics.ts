/* eslint-disable @typescript-eslint/camelcase */
import * as t from 'io-ts';
import { defer, EMPTY, from, merge, Observable, of } from 'rxjs';
import {
  catchError,
  concatMap,
  debounceTime,
  delay,
  distinctUntilChanged,
  filter,
  first,
  groupBy,
  map,
  mergeMap,
  pluck,
  scan,
  switchMap,
  tap,
  timeout,
  withLatestFrom,
} from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { Signer } from 'ethers/abstract-signer';
import { Event } from 'ethers/contract';
import { BigNumber, bigNumberify, toUtf8Bytes, verifyMessage, concat } from 'ethers/utils';
import { Two, Zero } from 'ethers/constants';
import memoize from 'lodash/memoize';

import { UserDeposit } from '../contracts/UserDeposit';
import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { messageGlobalSend } from '../messages/actions';
import { MessageType, PFSCapacityUpdate } from '../messages/types';
import { MessageTypeId, signMessage } from '../messages/utils';
import { ChannelState, Channel } from '../channels/state';
import { channelAmounts } from '../channels/utils';
import { Address, decode, Int, Signature, Signed, UInt, isntNil } from '../utils/types';
import { isActionOf } from '../utils/actions';
import { encode, losslessParse, losslessStringify } from '../utils/data';
import { getEventsStream } from '../utils/ethers';
import { RaidenError, ErrorCodes } from '../utils/error';
import { pluckDistinct } from '../utils/rx';
import { Capabilities } from '../constants';
import { iouClear, pathFind, iouPersist, pfsListUpdated } from './actions';
import { channelCanRoute, pfsInfo, pfsListInfo } from './utils';
import { IOU, LastIOUResults, PathResults, Paths, PFS } from './types';

const oneToNAddress = memoize(
  async (userDepositContract: UserDeposit) =>
    userDepositContract.functions.one_to_n_address() as Promise<Address>,
);

/**
 * Codec for PFS API returned error
 *
 * May contain other fields like error_details, but we don't care about them (for now)
 */
const PathError = t.readonly(
  t.type({
    /* eslint-disable-next-line @typescript-eslint/camelcase */
    error_code: t.number,
    errors: t.string,
  }),
);

const makeIOU = (
  sender: Address,
  receiver: Address,
  chainId: number,
  oneToNAddress: Address,
  blockNumber: number,
): IOU => ({
  sender: sender,
  receiver: receiver,
  chain_id: bigNumberify(chainId) as UInt<32>,
  amount: Zero as UInt<32>,
  one_to_n_address: oneToNAddress,
  expiration_block: bigNumberify(blockNumber).add(2 * 10 ** 5) as UInt<32>,
});

const updateIOU = (iou: IOU, price: UInt<32>): IOU => ({
  ...iou,
  amount: iou.amount.add(price) as UInt<32>,
});

const packIOU = (iou: IOU) =>
  concat([
    encode(iou.one_to_n_address, 20),
    encode(iou.chain_id, 32),
    encode(MessageTypeId.IOU, 32),
    encode(iou.sender, 20),
    encode(iou.receiver, 20),
    encode(iou.amount, 32),
    encode(iou.expiration_block, 32),
  ]);

const signIOU$ = (iou: IOU, signer: Signer): Observable<Signed<IOU>> =>
  from(signer.signMessage(packIOU(iou)) as Promise<Signature>).pipe(
    map(signature => ({ ...iou, signature })),
  );

const makeAndSignLastIOURequest$ = (sender: Address, receiver: Address, signer: Signer) =>
  defer(() => {
    const timestamp = new Date().toISOString().split('.')[0],
      message = concat([sender, receiver, toUtf8Bytes(timestamp)]);
    return from(signer.signMessage(message) as Promise<Signature>).pipe(
      map(signature => ({ sender, receiver, timestamp, signature })),
    );
  });

const prepareNextIOU$ = (
  pfs: PFS,
  tokenNetwork: Address,
  { address, signer, network, userDepositContract, latest$ }: RaidenEpicDeps,
): Observable<Signed<IOU>> => {
  return latest$.pipe(
    first(),
    switchMap(({ state, config: { httpTimeout } }) => {
      const cachedIOU: IOU | undefined = state.path.iou[tokenNetwork]?.[pfs.address];
      return (cachedIOU
        ? of(cachedIOU)
        : makeAndSignLastIOURequest$(address, pfs.address, signer).pipe(
            mergeMap(payload =>
              fromFetch(
                `${pfs.url}/api/v1/${tokenNetwork}/payment/iou?${new URLSearchParams(
                  payload,
                ).toString()}`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' },
                },
              ).pipe(timeout(httpTimeout)),
            ),
            withLatestFrom(latest$.pipe(pluck('state'))),
            mergeMap(async ([response, { blockNumber }]) => {
              if (response.status === 404) {
                return makeIOU(
                  address,
                  pfs.address,
                  network.chainId,
                  await oneToNAddress(userDepositContract),
                  blockNumber,
                );
              }
              const text = await response.text();
              if (!response.ok)
                throw new RaidenError(ErrorCodes.PFS_LAST_IOU_REQUEST_FAILED, {
                  responseStatus: response.status,
                  responseText: text,
                });

              const { last_iou: lastIou } = decode(LastIOUResults, losslessParse(text));
              const signer = verifyMessage(packIOU(lastIou), lastIou.signature);
              if (signer !== address)
                throw new RaidenError(ErrorCodes.PFS_IOU_SIGNATURE_MISMATCH, {
                  signer,
                  address,
                });
              return lastIou;
            }),
          )
      ).pipe(
        map(iou => updateIOU(iou, pfs.price)),
        mergeMap(iou => signIOU$(iou, signer)),
      );
    }),
  );
};

/**
 * Check if a transfer can be made and return a set of paths for it.
 *
 * @param action$ - Observable of pathFind.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps object
 * @returns Observable of pathFind.{success|failure} actions
 */
export const pathFindServiceEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<pathFind.success | pathFind.failure | iouPersist | iouClear> => {
  const { log, latest$ } = deps;
  return action$.pipe(
    filter(isActionOf(pathFind.request)),
    concatMap(action =>
      latest$.pipe(
        first(),
        mergeMap(
          ({ state, presences, config: { pfs: configPfs, httpTimeout, pfsSafetyMargin } }) => {
            const { tokenNetwork, target } = action.meta;
            if (!(tokenNetwork in state.channels))
              throw new RaidenError(ErrorCodes.PFS_UNKNOWN_TOKEN_NETWORK, { tokenNetwork });
            if (!(target in presences) || !presences[target].payload.available)
              throw new RaidenError(ErrorCodes.PFS_TARGET_OFFLINE, { target });
            if (presences[target].payload.caps?.[Capabilities.NO_RECEIVE])
              throw new RaidenError(ErrorCodes.PFS_TARGET_NO_RECEIVE, { target });

            // if pathFind received a set of paths, pass it through to validation/cleanup
            if (action.payload.paths) return of({ paths: action.payload.paths, iou: undefined });
            // else, if possible, use a direct transfer
            else if (
              channelCanRoute(
                state,
                presences,
                tokenNetwork,
                target,
                target,
                action.meta.value,
              ) === true
            ) {
              return of({
                paths: [{ path: [deps.address, target], fee: Zero as Int<32> }],
                iou: undefined,
              });
            } else if (
              action.payload.pfs === null || // explicitly disabled in action
              (!action.payload.pfs && configPfs === null) // undefined in action and disabled in config
            ) {
              // pfs not specified in action and disabled (null) in config
              throw new RaidenError(ErrorCodes.PFS_DISABLED);
            } else {
              // else, request a route from PFS.
              // pfs$ - Observable which emits one PFS info and then completes
              const pfs$ = action.payload.pfs
                ? // first, use action.payload.pfs as is, if present
                  of(action.payload.pfs)
                : configPfs
                ? // or if config.pfs isn't disabled (null) nor auto (''), fetch & use it
                  pfsInfo(configPfs, deps)
                : // else (action unset, config.pfs=''=auto mode)
                  latest$.pipe(
                    pluck('pfsList'), // get cached pfsList
                    // if needed, wait for list to be populated
                    first(pfsList => pfsList.length > 0),
                    // fetch pfsInfo from whole list & sort it
                    mergeMap(pfsList => pfsListInfo(pfsList, deps)),
                    tap(pfss => log.info('Auto-selecting best PFS from:', pfss)),
                    // pop best ranked
                    pluck(0),
                  );
              return pfs$.pipe(
                mergeMap(pfs =>
                  pfs.price.isZero()
                    ? of({ pfs, iou: undefined })
                    : prepareNextIOU$(pfs, tokenNetwork, deps).pipe(map(iou => ({ pfs, iou }))),
                ),
                mergeMap(({ pfs, iou }) =>
                  fromFetch(`${pfs.url}/api/v1/${tokenNetwork}/paths`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: losslessStringify({
                      from: deps.address,
                      to: target,
                      value: UInt(32).encode(action.meta.value),
                      max_paths: 10,
                      iou: iou
                        ? {
                            ...iou,
                            amount: UInt(32).encode(iou.amount),
                            expiration_block: UInt(32).encode(iou.expiration_block),
                            chain_id: UInt(32).encode(iou.chain_id),
                          }
                        : undefined,
                    }),
                  }).pipe(
                    timeout(httpTimeout),
                    map(response => ({ response, iou })),
                  ),
                ),
                mergeMap(async ({ response, iou }) => ({
                  response,
                  text: await response.text(),
                  iou,
                })),
                map(({ response, text, iou }) => {
                  // any decode error here will throw early and end up in catchError
                  const data = losslessParse(text);
                  if (!response.ok) {
                    return { error: decode(PathError, data), iou };
                  }
                  return {
                    paths: decode(PathResults, data).result.map(
                      r =>
                        ({
                          path: r.path,
                          // Add PFS safety margin to estimated fees
                          fee: r.estimated_fee
                            .mul(Math.round(pfsSafetyMargin * 1e6))
                            .div(1e6) as Int<32>,
                        } as const),
                    ),
                    iou,
                  };
                }),
              );
            }
          },
        ),
        withLatestFrom(latest$),
        // validate/cleanup received routes/paths/results
        mergeMap(([data, { state, presences }]) =>
          // looks like mergeMap with generator doesn't handle exceptions correctly
          // use from+iterator from iife generator instead
          from(
            (function*() {
              const { iou } = data;
              if (iou) {
                // if not error or error_code of "no route found", iou accepted => persist
                if (data.paths || data.error.error_code === 2201)
                  yield iouPersist(
                    { iou },
                    { tokenNetwork: action.meta.tokenNetwork, serviceAddress: iou.receiver },
                  );
                // else (error and error_code of "iou rejected"), clear
                else
                  yield iouClear(undefined, {
                    tokenNetwork: action.meta.tokenNetwork,
                    serviceAddress: iou.receiver,
                  });
              }
              // if error, don't proceed
              if (!data.paths) {
                throw new RaidenError(ErrorCodes.PFS_ERROR_RESPONSE, {
                  errorCode: data.error.error_code,
                  errors: data.error.errors,
                });
              }
              const filteredPaths: Paths = [],
                invalidatedRecipients = new Set<Address>();
              // eslint-disable-next-line prefer-const
              for (let { path, fee } of data.paths) {
                // if route has us as first hop, cleanup/shift
                if (path[0] === deps.address) path = path.slice(1);
                const recipient = path[0];
                // if this recipient was already invalidated in a previous iteration, skip
                if (invalidatedRecipients.has(recipient)) continue;
                // if we already found some valid route, allow only new routes through this peer
                const canTransferOrReason = !filteredPaths.length
                  ? channelCanRoute(
                      state,
                      presences,
                      action.meta.tokenNetwork,
                      recipient,
                      action.meta.target,
                      action.meta.value.add(fee) as UInt<32>,
                    )
                  : recipient !== filteredPaths[0].path[0]
                  ? 'path: already selected another recipient'
                  : fee.gt(filteredPaths[0].fee)
                  ? 'path: already selected a smaller fee'
                  : true;
                if (canTransferOrReason !== true) {
                  log.warn(
                    'Invalidated received route. Reason:',
                    canTransferOrReason,
                    'Route:',
                    path,
                  );
                  invalidatedRecipients.add(recipient);
                  continue;
                }
                filteredPaths.push({ path, fee });
              }
              if (!filteredPaths.length) throw new RaidenError(ErrorCodes.PFS_NO_ROUTES_FOUND);
              yield pathFind.success({ paths: filteredPaths }, action.meta);
            })(),
          ),
        ),
        catchError(err => of(pathFind.failure(err, action.meta))),
      ),
    ),
  );
};

function channelEntries(channels: RaidenState['channels']): ReadonlyArray<[string, Channel]> {
  return Object.entries(channels)
    .map(([tokenNetwork, partnerChannels]) =>
      Object.entries(partnerChannels).map(
        ([partner, channel]) => [`${partner}@${tokenNetwork}`, channel] as [string, Channel],
      ),
    )
    .reduce((acc, val) => [...acc, ...val], []);
}

function keyToTNP(key: string): { key: string; tokenNetwork: Address; partnerAddr: Address } {
  const [partner, tokenNetwork] = key.split('@');
  return { key, tokenNetwork: tokenNetwork as Address, partnerAddr: partner as Address };
}

type ChangedChannel = Channel & ReturnType<typeof keyToTNP>;

/**
 * Sends a [[PFSCapacityUpdate]] to PFS global room on new deposit on our side of channels
 *
 * @param action$ - Observable of channelDeposit.success actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of messageGlobalSend actions
 */
export const pfsCapacityUpdateEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, address, network, signer, config$, latest$ }: RaidenEpicDeps,
): Observable<messageGlobalSend> =>
  latest$.pipe(
    pluckDistinct('state', 'channels'),
    concatMap(channels => from(channelEntries(channels))),
    /* this scan stores a reference to each [key,value] in 'acc', and emit as 'changed' iff it
     * changes from last time seen. It relies on value references changing only if needed */
    scan(
      ({ acc }, [key, channel]) =>
        // if ref didn't change, emit previous accumulator, without 'changed' value
        acc[key] === channel
          ? { acc }
          : // else, update ref in 'acc' and emit value in 'changed' prop
            {
              acc: { ...acc, [key]: channel },
              changed: { ...channel, ...keyToTNP(key) } as ChangedChannel,
            },
      { acc: {} } as { acc: { [k: string]: Channel }; changed?: ChangedChannel },
    ),
    pluck('changed'),
    filter(isntNil), // filter out if reference didn't change from last emit
    groupBy(({ key }) => key),
    withLatestFrom(config$),
    mergeMap(([grouped$, { httpTimeout }]) =>
      grouped$.pipe(
        withLatestFrom(config$),
        filter(([, { pfsRoom }]) => !!pfsRoom), // ignore actions while/if config.pfsRoom isn't set
        debounceTime(httpTimeout / 2), // default: 15s
        concatMap(([channel, { revealTimeout, pfsRoom }]) => {
          const { tokenNetwork, partnerAddr: partner } = channel;
          if (channel.state !== ChannelState.open) return EMPTY;
          const { ownCapacity, partnerCapacity } = channelAmounts(channel);

          const message: PFSCapacityUpdate = {
            type: MessageType.PFS_CAPACITY_UPDATE,
            canonical_identifier: {
              chain_identifier: bigNumberify(network.chainId) as UInt<32>,
              token_network_address: tokenNetwork,
              channel_identifier: bigNumberify(channel.id) as UInt<32>,
            },
            updating_participant: address,
            other_participant: partner,
            updating_nonce: channel.own.balanceProof
              ? channel.own.balanceProof.nonce
              : (Zero as UInt<8>),
            other_nonce: channel.partner.balanceProof
              ? channel.partner.balanceProof.nonce
              : (Zero as UInt<8>),
            updating_capacity: ownCapacity,
            other_capacity: partnerCapacity,
            reveal_timeout: bigNumberify(revealTimeout) as UInt<32>,
          };

          return defer(() => signMessage(signer, message, { log })).pipe(
            map(signed => messageGlobalSend({ message: signed }, { roomName: pfsRoom! })),
            catchError(err => {
              log.error('Error trying to generate & sign PFSCapacityUpdate', err);
              return EMPTY;
            }),
          );
        }),
      ),
    ),
  );

/**
 * Fetch & monitors ServiceRegistry's RegisteredService events, keep track of valid_till expiration
 * and aggregate list of valid service addresses
 *
 * Notice this epic only deals with the events & addresses, and don't fetch URLs, which need to be
 * fetched on-demand through [[pfsInfo]] & [[pfsListInfo]].
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps object
 * @returns Observable of pfsListUpdated actions
 */
export const pfsServiceRegistryMonitorEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { serviceRegistryContract, contractsInfo, config$ }: RaidenEpicDeps,
): Observable<pfsListUpdated> =>
  config$.pipe(
    // monitors config.pfs, and only monitors contract if it's empty
    pluckDistinct('pfs'),
    switchMap(pfs =>
      pfs !== ''
        ? // disable ServiceRegistry monitoring if/while pfs is null=disabled or truty
          EMPTY
        : // type of elements emitted by getEventsStream (past and new events coming from contract):
          // [service, valid_till, deposit_amount, deposit_contract, Event]
          getEventsStream<[Address, BigNumber, UInt<32>, Address, Event]>(
            serviceRegistryContract,
            [serviceRegistryContract.filters.RegisteredService(null, null, null, null)],
            of(contractsInfo.ServiceRegistry.block_number), // at boot, always fetch from deploy block
          ).pipe(
            groupBy(([service]) => service),
            mergeMap(grouped$ =>
              grouped$.pipe(
                // switchMap ensures new events for each server (grouped$) picks latest event
                switchMap(([service, valid_till]) => {
                  const now = Date.now(),
                    validTill = valid_till.mul(1000); // milliseconds valid_till
                  if (validTill.lt(now)) return EMPTY; // this event already expired
                  // end$ will emit valid=false iff <2^31 ms in the future (setTimeout limit)
                  const end$ = validTill.sub(now).lt(Two.pow(31))
                    ? of({ service, valid: false }).pipe(delay(new Date(validTill.toNumber())))
                    : EMPTY;
                  return merge(of({ service, valid: true }), end$);
                }),
              ),
            ),
            scan(
              (acc, { service, valid }) =>
                !valid && acc.includes(service)
                  ? acc.filter(s => s !== service)
                  : valid && !acc.includes(service)
                  ? [...acc, service]
                  : acc,
              [] as readonly Address[],
            ),
            distinctUntilChanged(),
            debounceTime(1e3), // debounce burst of updates on initial fetch
            map(pfsList => pfsListUpdated({ pfsList })),
          ),
    ),
  );
