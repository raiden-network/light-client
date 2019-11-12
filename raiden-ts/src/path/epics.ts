/* eslint-disable @typescript-eslint/camelcase */
import { combineLatest, defer, EMPTY, from, merge, Observable, of } from 'rxjs';
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
  publishReplay,
  scan,
  startWith,
  switchMap,
  tap,
  timeout,
  withLatestFrom,
} from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { ActionType, isActionOf } from 'typesafe-actions';
import { BigNumber, bigNumberify, hexDataLength, hexlify, toUtf8Bytes } from 'ethers/utils';
import { Two, Zero } from 'ethers/constants';
import { Event } from 'ethers/contract';

import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { getPresences$ } from '../transport/utils';
import { messageGlobalSend } from '../messages/actions';
import { MessageType, PFSCapacityUpdate } from '../messages/types';
import { MessageTypeId, signMessage } from '../messages/utils';
import { channelDeposited } from '../channels/actions';
import { ChannelState } from '../channels/state';
import { channelAmounts } from '../channels/utils';
import { Address, decode, Int, Signature, Signed, UInt } from '../utils/types';
import { encode, losslessParse, losslessStringify } from '../utils/data';
import { getEventsStream } from '../utils/ethers';
import {
  clearIOU,
  pathFind,
  pathFindFailed,
  pathFound,
  persistIOU,
  pfsListUpdated,
} from './actions';
import { channelCanRoute, pfsInfo, pfsListInfo } from './utils';
import { IOU, LastIOUResults, PathError, PathResults, Paths, PFS } from './types';
import { concat } from 'ethers/utils/bytes';
import { Signer } from 'ethers';
import { memoize } from 'lodash/fp';
import { UserDeposit } from '../contracts/UserDeposit';

type IOUPayload = {
  serviceAddress: Address;
  signedIOU?: Signed<IOU>;
};

class InvalidPFSRequestError extends Error {
  readonly payload: IOUPayload;
  readonly errorCode: number;
  constructor(message: string, errorCode: number, payload: IOUPayload) {
    super(message);
    this.payload = payload;
    this.errorCode = errorCode;
  }
}

const makeIOU = (
  sender: Address,
  receiver: Address,
  chainId: UInt<32>,
  oneToNAddress: Address,
  blockNumber: number,
) =>
  ({
    sender: sender,
    receiver: receiver,
    chain_id: chainId,
    amount: Zero as UInt<32>,
    one_to_n_address: oneToNAddress,
    expiration_block: bigNumberify(blockNumber).add(2 * 10 ** 5),
  } as IOU);

const updateIOU = (iou: IOU, price: UInt<32>) =>
  ({
    ...iou,
    amount: iou.amount.add(price),
  } as IOU);

const signIOU$ = (iou: IOU, signer: Signer) =>
  from(signer.signMessage(
    concat([
      encode(iou.one_to_n_address, 20),
      encode(iou.chain_id, 32),
      encode(MessageTypeId.IOU, 32),
      encode(iou.sender, 20),
      encode(iou.receiver, 20),
      encode(iou.amount, 32),
      encode(iou.expiration_block, 32),
    ]),
  ) as Promise<Signature>).pipe(map(signature => ({ ...iou, signature } as Signed<IOU>)));

const makeAndSignLastIOURequest$ = (sender: Address, receiver: Address, signer: Signer) =>
  defer(() => {
    const payload = {
      sender,
      receiver,
      timestamp: new Date(Date.now()).toISOString().split('.')[0],
    };

    const timestamp = hexlify(toUtf8Bytes(payload.timestamp));
    const messageHash = concat([
      encode(payload.sender, 20),
      encode(payload.receiver, 20),
      encode(timestamp, hexDataLength(timestamp)),
    ]);
    return from(signer.signMessage(messageHash) as Promise<Signature>).pipe(
      map(signature => ({
        ...payload,
        signature,
      })),
    );
  });

const prepareNextIOU$ = (
  state: RaidenState,
  pfs: PFS,
  deps: RaidenEpicDeps,
  httpTimeout: number,
  tokenNetwork: Address,
) => {
  const cachedIOU: IOU | undefined = get(state.path, ['iou', tokenNetwork, pfs.address]);
  return (cachedIOU
    ? of(cachedIOU)
    : makeAndSignLastIOURequest$(state.address, pfs.address, deps.signer).pipe(
        mergeMap(payload =>
          fromFetch(
            `${pfs.url}/api/v1/${tokenNetwork}/payment/iou?${new URLSearchParams(
              payload,
            ).toString()}`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        ),
        timeout(httpTimeout),
        mergeMap(async response => {
          const text = await response.text();
          const oneToNAddress = memoize(
            async (userDepositContract: UserDeposit) =>
              userDepositContract.functions.one_to_n_address() as Promise<Address>,
          );
          if (response.status === 404) {
            return makeIOU(
              state.address,
              pfs.address,
              bigNumberify(state.chainId) as UInt<32>,
              await oneToNAddress(deps.userDepositContract),
              state.blockNumber,
            );
          }
          if (!response.ok)
            throw new Error(`PFS: last IOU request: code=${response.status} => body="${text}"`);
          return decode(LastIOUResults, losslessParse(text)).last_iou;
        }),
      )
  ).pipe(
    map(iou => updateIOU(iou, pfs.price)),
    mergeMap(iou => signIOU$(iou, deps.signer)),
  );
};

/**
 * Check if a transfer can be made and return a set of paths for it.
 *
 * @param action$ - Observable of pathFind actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps object
 * @returns Observable of pathFound|pathFindFailed actions
 */
export const pathFindServiceEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<
  ActionType<typeof pathFound | typeof pathFindFailed | typeof persistIOU | typeof clearIOU>
> =>
  combineLatest(
    state$,
    getPresences$(action$),
    deps.config$, // don't need to be cached, but here to avoid separate withLatestFrom
    action$.pipe(
      filter(isActionOf(pfsListUpdated)),
      pluck('payload', 'pfsList'),
      startWith([] as readonly Address[]),
    ),
  ).pipe(
    publishReplay(1, undefined, cached$ => {
      return action$.pipe(
        filter(isActionOf(pathFind)),
        concatMap(action =>
          cached$.pipe(
            first(),
            mergeMap(([state, presences, { pfs: configPfs, httpTimeout, pfsSafetyMargin }]) => {
              const { tokenNetwork, target } = action.meta;
              if (!(tokenNetwork in state.channels))
                throw new Error(`PFS: unknown tokenNetwork ${tokenNetwork}`);
              if (!(target in presences) || !presences[target].payload.available)
                throw new Error(`PFS: target ${target} not online`);
              // if pathFind received a set of paths, pass it through to validation/cleanup
              if (action.payload.paths) return of(action.payload.paths);
              // else, if possible, use a direct transfer
              else if (
                channelCanRoute(state, presences, tokenNetwork, target, action.meta.value) === true
              ) {
                return of([{ path: [state.address, target], fee: Zero as Int<32> }]);
              } else if (!action.payload.pfs && configPfs === null) {
                // pfs not specified in action and disabled (null) in config
                throw new Error(`PFS disabled and no direct route available`);
              } else {
                // else, request a route from PFS.
                // pfs$ - Observable which emits one PFS info and then completes
                const pfs$ = action.payload.pfs
                  ? // first, honor action.payload.pfs
                    of(action.payload.pfs)
                  : configPfs != null
                  ? // or if config.pfs isn't disabled nor auto (undefined), use it
                    // configPfs is addr or url, so fetch pfsInfo from it
                    pfsInfo(configPfs, deps)
                  : // else (config.pfs undefined, auto mode)
                    cached$.pipe(
                      pluck(3), // get cached pfsList (4th combined value)
                      // if needed, wait for list to be populated
                      first(pfsList => pfsList.length > 0),
                      // fetch pfsInfo from whole list & sort it
                      mergeMap(pfsList => pfsListInfo(pfsList, deps)),
                      tap(pfss => console.log('Auto-selecting best PFS from:', pfss)),
                      // pop best ranked
                      pluck(0),
                    );
                return pfs$.pipe(
                  mergeMap(pfs =>
                    pfs.price.isZero()
                      ? of([undefined, pfs] as [undefined, PFS])
                      : prepareNextIOU$(state, pfs, deps, httpTimeout, tokenNetwork).pipe(
                          map(signedIou => [signedIou, pfs] as [Signed<IOU>, PFS]),
                        ),
                  ),
                  mergeMap(([signedIOU, pfs]) =>
                    fromFetch(`${pfs.url}/api/v1/${tokenNetwork}/paths`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: losslessStringify({
                        from: deps.address,
                        to: target,
                        value: UInt(32).encode(action.meta.value),
                        max_paths: 10,
                        iou: signedIOU
                          ? {
                              ...signedIOU,
                              amount: UInt(32).encode(signedIOU.amount),
                              expiration_block: UInt(32).encode(signedIOU.expiration_block),
                              chain_id: UInt(32).encode(signedIOU.chain_id),
                            }
                          : undefined,
                      }),
                    }).pipe(
                      map(
                        response =>
                          [
                            response,
                            {
                              serviceAddress: pfs.address,
                              signedIOU: signedIOU,
                            } as IOUPayload,
                          ] as [Response, IOUPayload],
                      ),
                    ),
                  ),
                  timeout(httpTimeout),
                  mergeMap(async ([response, payload]) => {
                    const text = await response.text();
                    const data = losslessParse(text);
                    if (!response.ok) {
                      throw new InvalidPFSRequestError(
                        `PFS: paths request: code=${response.status} => body="${text}"`,
                        decode(PathError, data).error_code,
                        payload,
                      );
                    }
                    return [decode(PathResults, data), payload] as [
                      PathResults,
                      IOUPayload | undefined,
                    ];
                  }),
                  map(([results, iou]): [Paths, IOUPayload | undefined] => [
                    results.result.map(r => ({
                      path: r.path,
                      // Add PFS safety margin to estimated fees
                      fee: r.estimated_fee.mul(Math.round(pfsSafetyMargin * 1e6)).div(1e6) as Int<
                        32
                      >,
                    })),
                    iou,
                  ]),
                );
              }
            }),
            withLatestFrom(cached$),
            // validate/cleanup received routes/paths/results
            mergeMap(function*([[paths, payload], [state, presences]]) {
              if (payload) {
                const { signedIOU, serviceAddress } = payload as IOUPayload;
                yield persistIOU(
                  { signedIOU: signedIOU! },
                  { tokenNetwork: action.meta.tokenNetwork, serviceAddress },
                );
              }
              const filteredPaths: Paths = [],
                invalidatedRecipients = new Set<Address>();
              // eslint-disable-next-line prefer-const
              for (let { path, fee } of paths as Paths) {
                // if route has us as first hop, cleanup/shift
                if (path[0] === state.address) path = path.slice(1);
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
                      action.meta.value.add(fee) as UInt<32>,
                    )
                  : recipient !== filteredPaths[0].path[0]
                  ? 'path: already selected another recipient'
                  : fee.gt(filteredPaths[0].fee)
                  ? 'path: already selected a smaller fee'
                  : true;
                if (canTransferOrReason !== true) {
                  console.log(
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
              if (!filteredPaths.length) throw new Error(`PFS: no valid routes found`);
              yield pathFound({ paths: filteredPaths }, action.meta);
            }),
            catchError(function*(err) {
              if (err instanceof InvalidPFSRequestError) {
                if (err.errorCode === 2201) {
                  const { signedIOU, serviceAddress } = err.payload;
                  yield persistIOU(
                    { signedIOU: signedIOU! },
                    { tokenNetwork: action.meta.tokenNetwork, serviceAddress },
                  );
                } else {
                  const { serviceAddress } = err.payload;
                  yield clearIOU(
                    {},
                    {
                      tokenNetwork: action.meta.tokenNetwork,
                      serviceAddress,
                    },
                  );
                }
              }
              yield pathFindFailed(err, action.meta);
            }),
          ),
        ),
      );
    }),
  );

/**
 * Sends a [[PFSCapacityUpdate]] to PFS global room on new deposit on our side of channels
 *
 * @param action$ - Observable of channelDeposited actions
 * @param state$ - Observable of RaidenStates
 * @returns Observable of messageGlobalSend actions
 */
export const pfsCapacityUpdateEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { address, network, signer, config$ }: RaidenEpicDeps,
): Observable<ActionType<typeof messageGlobalSend>> =>
  action$.pipe(
    filter(isActionOf(channelDeposited)),
    filter(action => action.payload.participant === address),
    debounceTime(10e3),
    withLatestFrom(state$, config$),
    filter(([, , { pfsRoom }]) => !!pfsRoom), // ignore actions while/if config.pfsRoom isn't set
    mergeMap(([action, state, { revealTimeout, pfsRoom }]) => {
      const channel = state.channels[action.meta.tokenNetwork][action.meta.partner];
      if (!channel || channel.state !== ChannelState.open) return EMPTY;

      const { ownCapacity, partnerCapacity } = channelAmounts(channel);

      const message: PFSCapacityUpdate = {
        type: MessageType.PFS_CAPACITY_UPDATE,
        canonical_identifier: {
          chain_identifier: bigNumberify(network.chainId) as UInt<32>,
          token_network_address: action.meta.tokenNetwork,
          channel_identifier: bigNumberify(channel.id) as UInt<32>,
        },
        updating_participant: address,
        other_participant: action.meta.partner,
        updating_nonce: channel.own.balanceProof
          ? channel.own.balanceProof.nonce
          : (Zero as UInt<8>),
        other_nonce: channel.partner.balanceProof
          ? channel.partner.balanceProof.nonce
          : (Zero as UInt<8>),
        updating_capacity: ownCapacity,
        other_capacity: partnerCapacity,
        reveal_timeout: revealTimeout,
      };

      return from(signMessage(signer, message)).pipe(
        map(signed => messageGlobalSend({ message: signed }, { roomName: pfsRoom! })),
      );
    }),
    catchError(err => {
      console.error('Error trying to generate & sign PFSCapacityUpdate', err);
      return EMPTY;
    }),
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
  {  }: Observable<RaidenAction>,
  {  }: Observable<RaidenState>,
  { serviceRegistryContract, contractsInfo, config$ }: RaidenEpicDeps,
): Observable<ActionType<typeof pfsListUpdated>> =>
  config$.pipe(
    // monitors config.pfs, and only monitors contract if it's undefined
    pluck('pfs'),
    distinctUntilChanged(),
    switchMap(pfs =>
      pfs !== undefined
        ? // disable ServiceRegistry monitoring if/while pfs is null=disabled or set
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
