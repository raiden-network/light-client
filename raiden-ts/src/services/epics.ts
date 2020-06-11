import * as t from 'io-ts';
import { defer, EMPTY, from, merge, Observable, of, combineLatest } from 'rxjs';
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
  exhaustMap,
  skip,
  take,
} from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { Event } from 'ethers/contract';
import { BigNumber, bigNumberify, toUtf8Bytes, verifyMessage, concat } from 'ethers/utils';
import { Two, Zero, WeiPerEther } from 'ethers/constants';
import memoize from 'lodash/memoize';

import { UserDeposit } from '../contracts/UserDeposit';
import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { messageGlobalSend } from '../messages/actions';
import { MessageType, PFSCapacityUpdate, PFSFeeUpdate, MonitorRequest } from '../messages/types';
import { MessageTypeId, signMessage, createBalanceHash } from '../messages/utils';
import { ChannelState, Channel } from '../channels/state';
import { assertTx, channelAmounts, groupChannel$ } from '../channels/utils';
import { Address, decode, Int, Signature, Signed, UInt } from '../utils/types';
import { isActionOf } from '../utils/actions';
import { encode, losslessParse, losslessStringify } from '../utils/data';
import { getEventsStream } from '../utils/ethers';
import { RaidenError, ErrorCodes, assert } from '../utils/error';
import { pluckDistinct } from '../utils/rx';
import { Capabilities } from '../constants';
import { getContractWithSigner } from '../helpers';
import { newBlock } from '../channels/actions';

import {
  iouClear,
  pathFind,
  iouPersist,
  pfsListUpdated,
  udcDeposited,
  udcWithdraw,
  udcWithdrawPlanned,
} from './actions';
import { channelCanRoute, pfsInfo, pfsListInfo, packIOU, signIOU } from './utils';
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
    error_code: t.number,
    errors: t.string,
  }),
);

// returns a ISO string truncated at the integer second resolution
function makeTimestamp(time?: Date): string {
  return (time ?? new Date()).toISOString().substr(0, 19);
}

function fetchLastIou$(
  pfs: PFS,
  tokenNetwork: Address,
  { address, signer, network, userDepositContract, latest$, config$ }: RaidenEpicDeps,
): Observable<IOU> {
  return defer(() => {
    const timestamp = makeTimestamp(),
      message = concat([address, pfs.address, toUtf8Bytes(timestamp)]);
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
      ).pipe(timeout(httpTimeout)),
    ),
    withLatestFrom(latest$.pipe(pluck('state', 'blockNumber'))),
    mergeMap(async ([response, blockNumber]) => {
      if (response.status === 404) {
        return {
          sender: address,
          receiver: pfs.address,
          chain_id: bigNumberify(network.chainId) as UInt<32>,
          amount: Zero as UInt<32>,
          one_to_n_address: await oneToNAddress(userDepositContract),
          expiration_block: bigNumberify(blockNumber).add(2 * 10 ** 5) as UInt<32>,
        }; // return empty/zeroed IOU
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
  );
}

function prepareNextIOU$(
  pfs: PFS,
  tokenNetwork: Address,
  deps: RaidenEpicDeps,
): Observable<Signed<IOU>> {
  return deps.latest$.pipe(
    first(),
    mergeMap(({ state }) => {
      const cachedIOU = state.iou[tokenNetwork]?.[pfs.address];
      return cachedIOU ? of(cachedIOU) : fetchLastIou$(pfs, tokenNetwork, deps);
    }),
    // increment lastIou by pfs.price
    map((iou) => ({ ...iou, amount: iou.amount.add(pfs.price) as UInt<32> })),
    mergeMap((iou) => signIOU(deps.signer, iou)),
  );
}

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
    concatMap((action) =>
      latest$.pipe(
        first(),
        mergeMap(
          ({ state, presences, config: { pfs: configPfs, httpTimeout, pfsSafetyMargin } }) => {
            const { tokenNetwork, target } = action.meta;
            if (!Object.values(state.tokens).includes(tokenNetwork))
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
                ? // or if config.pfs isn't disabled (null) nor auto (''|undefined), fetch & use it
                  pfsInfo(configPfs, deps)
                : // else (action unset, config.pfs=''|undefined=auto mode)
                  latest$.pipe(
                    pluck('pfsList'), // get cached pfsList
                    // if needed, wait for list to be populated
                    first((pfsList) => pfsList.length > 0),
                    // fetch pfsInfo from whole list & sort it
                    mergeMap((pfsList) => pfsListInfo(pfsList, deps)),
                    tap((pfss) => log.info('Auto-selecting best PFS from:', pfss)),
                    // pop best ranked
                    pluck(0),
                  );
              return pfs$.pipe(
                mergeMap((pfs) =>
                  pfs.price.isZero()
                    ? of({ pfs, iou: undefined })
                    : prepareNextIOU$(pfs, tokenNetwork, deps).pipe(map((iou) => ({ pfs, iou }))),
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
                    map((response) => ({ response, iou })),
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
                      (r) =>
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
            (function* () {
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
                const { errors, error_code } = data.error;
                if (error_code === 2201) {
                  throw new RaidenError(ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES);
                }

                throw new RaidenError(ErrorCodes.PFS_ERROR_RESPONSE, {
                  errorCode: error_code,
                  errors,
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
        catchError((err) => of(pathFind.failure(err, action.meta))),
      ),
    ),
  );
};

/**
 * Sends a [[PFSCapacityUpdate]] to PFS global room on new deposit on our side of channels
 *
 * @param action$ - Observable of channelDeposit.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.log - Logger instance
 * @param deps.address - Our address
 * @param deps.network - Current Network
 * @param deps.signer - Signer instance
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @returns Observable of messageGlobalSend actions
 */
export const pfsCapacityUpdateEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, address, network, signer, latest$, config$ }: RaidenEpicDeps,
): Observable<messageGlobalSend> =>
  latest$.pipe(
    pluck('state'),
    groupChannel$,
    withLatestFrom(config$),
    mergeMap(([grouped$, { httpTimeout }]) =>
      grouped$.pipe(
        withLatestFrom(config$),
        filter(([, { pfsRoom }]) => !!pfsRoom), // ignore actions while/if config.pfsRoom isn't set
        debounceTime(httpTimeout / 2), // default: 15s
        concatMap(([channel, { revealTimeout, pfsRoom }]) => {
          const tokenNetwork = channel.tokenNetwork;
          const partner = channel.partner.address;
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
            updating_nonce: channel.own.balanceProof.nonce,
            other_nonce: channel.partner.balanceProof.nonce,
            updating_capacity: ownCapacity,
            other_capacity: partnerCapacity,
            reveal_timeout: bigNumberify(revealTimeout) as UInt<32>,
          };

          return defer(() => signMessage(signer, message, { log })).pipe(
            map((signed) => messageGlobalSend({ message: signed }, { roomName: pfsRoom! })),
            catchError((err) => {
              log.error('Error trying to generate & sign PFSCapacityUpdate', err);
              return EMPTY;
            }),
          );
        }),
      ),
    ),
  );

/**
 * When monitoring a channel (either a new channel or a previously monitored one), send a matching
 * PFSFeeUpdate to path_finding global room, so PFSs can pick us for mediation
 * TODO: Currently, we always send Zero fees; we should send correct fee data from config
 *
 * @param action$ - Observable of channelMonitor actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Raiden epic dependencies
 * @param deps.log - Logger instance
 * @param deps.address - Our address
 * @param deps.network - Current network
 * @param deps.signer - Signer instance
 * @param deps.config$ - Config observable
 * @returns Observable of messageGlobalSend actions
 */
export const pfsFeeUpdateEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, address, network, signer, config$ }: RaidenEpicDeps,
): Observable<messageGlobalSend> =>
  state$.pipe(
    groupChannel$,
    // get only first state per channel
    mergeMap((grouped$) => grouped$.pipe(first())),
    withLatestFrom(config$),
    // ignore actions while/if mediating not enabled
    filter(([, { pfsRoom, caps }]) => !!pfsRoom && !caps?.[Capabilities.NO_MEDIATE]),
    mergeMap(([channel, { pfsRoom }]) => {
      if (channel.state !== ChannelState.open) return EMPTY;

      const message: PFSFeeUpdate = {
        type: MessageType.PFS_FEE_UPDATE,
        canonical_identifier: {
          chain_identifier: bigNumberify(network.chainId) as UInt<32>,
          token_network_address: channel.tokenNetwork,
          channel_identifier: bigNumberify(channel.id) as UInt<32>,
        },
        updating_participant: address,
        timestamp: makeTimestamp(),
        fee_schedule: {
          cap_fees: true,
          imbalance_penalty: null,
          proportional: Zero as Int<32>,
          flat: Zero as Int<32>,
        },
      };

      return from(signMessage(signer, message, { log })).pipe(
        map((signed) => messageGlobalSend({ message: signed }, { roomName: pfsRoom! })),
        catchError((err) => {
          log.error('Error trying to generate & sign PFSFeeUpdate', err);
          return EMPTY;
        }),
      );
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
 * @param deps.serviceRegistryContract - ServiceRegistry contract instance
 * @param deps.contractsInfo - Contracts info mapping
 * @param deps.config$ - Config observable
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
    switchMap((pfs) =>
      pfs !== '' && pfs !== undefined
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
            mergeMap((grouped$) =>
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
                  ? acc.filter((s) => s !== service)
                  : valid && !acc.includes(service)
                  ? [...acc, service]
                  : acc,
              [] as readonly Address[],
            ),
            distinctUntilChanged(),
            debounceTime(1e3), // debounce burst of updates on initial fetch
            map((pfsList) => pfsListUpdated({ pfsList })),
          ),
    ),
  );

/**
 * Monitors the balance of UDC and emits udcDeposited, made available in Latest['udcBalance']
 *
 * @param action$ - Observable of aidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.address - Our address
 * @param deps.latest$ - Latest observable
 * @param deps.userDepositContract - UserDeposit contract instance
 * @returns Observable of udcDeposited actions
 */
export const monitorUdcBalanceEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { address, latest$, userDepositContract }: RaidenEpicDeps,
): Observable<udcDeposited> =>
  latest$.pipe(
    pluckDistinct('state', 'blockNumber'),
    // it's seems ugly to call on each block, but UserDepositContract doesn't expose deposits as
    // events, and ethers actually do that to monitor token balances, so it's equivalent
    exhaustMap(() => userDepositContract.functions.effectiveBalance(address) as Promise<UInt<32>>),
    distinctUntilChanged((x, y) => y.eq(x)),
    map(udcDeposited),
  );

/**
 * Makes a *Map callback which returns an observable of actions to send RequestMonitoring messages
 *
 * @param deps - Epics dependencies
 * @param deps.address - Our Address
 * @param deps.log - Logger instance
 * @param deps.network - Current network
 * @param deps.signer - Signer instance
 * @param deps.contractsInfo - Contracts info mapping
 * @param deps.latest$ - Latest observable
 * @param deps.config$ - Config observable
 * @returns An operator which receives a ChangedChannel and RaidenConfig and returns a cold
 * Observable of messageGlobalSend actions to the global monitoring room
 */
function makeMonitoringRequest$({
  address,
  log,
  network,
  signer,
  contractsInfo,
  latest$,
  config$,
}: RaidenEpicDeps) {
  return (channel: Channel) => {
    const { partnerUnlocked } = channelAmounts(channel);
    if (!partnerUnlocked.gt(Zero)) return EMPTY; // give up early if nothing to lose

    return combineLatest([latest$, config$]).pipe(
      // combineLatest + filter ensures it'll pass if anything here changes
      filter(
        ([{ udcBalance }, { monitoringRoom, monitoringReward, rateToSvt }]) =>
          // ignore actions while/if config.monitoringRoom isn't set
          !!monitoringRoom &&
          !!monitoringReward?.gt?.(Zero) &&
          // wait for udcBalance >= monitoringReward, fires immediately if already
          udcBalance.gte(monitoringReward) &&
          // use partner's total off & on-chain unlocked, total we'd lose if don't update BP
          partnerUnlocked
            // use rateToSvt to convert to equivalent SVT, and pass only if > monitoringReward;
            // default rate=0 means it'll NEVER monitor if no rate is set for token
            .mul(rateToSvt[channel.token] ?? Zero)
            .div(WeiPerEther)
            .gt(monitoringReward),
      ),
      take(1), // take/act on first time all conditions above pass
      mergeMap(([, { monitoringReward, monitoringRoom }]) => {
        const balanceProof = channel.partner.balanceProof;
        const balanceHash = createBalanceHash(balanceProof);

        const nonClosingMessage = concat([
          encode(channel.tokenNetwork, 20),
          encode(network.chainId, 32),
          encode(MessageTypeId.BALANCE_PROOF_UPDATE, 32),
          encode(channel.id, 32),
          encode(balanceHash, 32),
          encode(balanceProof.nonce, 32),
          encode(balanceProof.additionalHash, 32),
          encode(balanceProof.signature, 65), // partner's signature for this balance proof
        ]); // UInt8Array of 277 bytes

        // first sign the nonClosing signature, then the actual message
        return from(signer.signMessage(nonClosingMessage) as Promise<Signature>).pipe(
          mergeMap((nonClosingSignature) =>
            signMessage<MonitorRequest>(
              signer,
              {
                type: MessageType.MONITOR_REQUEST,
                balance_proof: {
                  chain_id: balanceProof.chainId,
                  token_network_address: balanceProof.tokenNetworkAddress,
                  channel_identifier: bigNumberify(channel.id) as UInt<32>,
                  nonce: balanceProof.nonce,
                  balance_hash: balanceHash,
                  additional_hash: balanceProof.additionalHash,
                  signature: balanceProof.signature,
                },
                non_closing_participant: address,
                non_closing_signature: nonClosingSignature,
                monitoring_service_contract_address: contractsInfo.MonitoringService.address,
                reward_amount: monitoringReward!,
              },
              { log },
            ),
          ),
          map((message) => messageGlobalSend({ message }, { roomName: monitoringRoom! })),
        );
      }),
      catchError((err) => {
        log.error('Error trying to generate & sign MonitorRequest', err);
        return EMPTY;
      }),
    );
  };
}

/**
 * Handle balanceProof change from partner (received transfers) and request monitoring from MS
 *
 * @param action$ - Observable of channelDeposit.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @returns Observable of messageGlobalSend actions
 */
export const monitorRequestEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<messageGlobalSend> =>
  deps.latest$.pipe(
    pluck('state'),
    groupChannel$,
    withLatestFrom(deps.config$),
    mergeMap(([grouped$, { httpTimeout }]) =>
      grouped$.pipe(
        // act only if partner's transferredAmount or lockedAmount changes
        distinctUntilChanged(
          (x, y) =>
            y.partner.balanceProof.transferredAmount.eq(
              x.partner.balanceProof.transferredAmount,
            ) &&
            y.partner.balanceProof.lockedAmount.eq(x.partner.balanceProof.lockedAmount) &&
            y.partner.locks === x.partner.locks,
        ),
        skip(1), // distinctUntilChanged allows first, we want to skip and act only on changes
        debounceTime(httpTimeout / 2), // default: 15s
        // switchMap may unsubscribe from previous udcBalance wait/signature prompts if partner's
        // balanceProof balance changes in the meantime
        switchMap(makeMonitoringRequest$(deps)),
      ),
    ),
  );

export const udcWithdrawRequestEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { userDepositContract, address, log, signer, config$, provider }: RaidenEpicDeps,
): Observable<udcWithdrawPlanned | udcWithdraw.failure> => {
  return action$.pipe(
    filter(udcWithdraw.request.is),
    mergeMap((action) =>
      userDepositContract.functions
        .balances(address)
        .then((balance) => [action, balance] as const),
    ),
    concatMap(([action, balance]) => {
      const amount = action.meta.amount;
      try {
        assert(amount.gt(Zero), [
          ErrorCodes.UDC_PLAN_WITHDRAW_GT_ZERO,
          {
            amount: amount.toString(),
          },
        ]);

        assert(balance.sub(amount).gte(Zero), [
          ErrorCodes.UDC_PLAN_WITHDRAW_EXCEEDS_AVAILABLE,
          {
            balance: balance.toString(),
            amount: amount.toString(),
          },
        ]);
      } catch (e) {
        return of(udcWithdraw.failure(e, action.meta));
      }
      const contract = getContractWithSigner(userDepositContract, signer);
      return from(contract.functions.planWithdraw(amount)).pipe(
        assertTx('planWithdraw', ErrorCodes.UDC_PLAN_WITHDRAW_FAILED, { log }),
        concatMap((txHash) =>
          combineLatest([
            from(provider.getTransactionReceipt(txHash)),
            state$.pipe(pluckDistinct('blockNumber')),
            config$.pipe(pluckDistinct('confirmationBlocks')),
          ]).pipe(
            first(
              ([receipt, blockNumber, confirmationBlocks]) =>
                !!receipt.blockNumber && receipt.blockNumber + confirmationBlocks <= blockNumber,
            ),
            map(() => txHash),
          ),
        ),
        concatMap((txHash) => {
          return from(userDepositContract.functions.withdraw_plans(address)).pipe(
            map(({ amount, withdraw_block }) =>
              udcWithdrawPlanned(
                {
                  txHash,
                  block: withdraw_block.toNumber(),
                },
                {
                  amount: amount as UInt<32>,
                },
              ),
            ),
          );
        }),
        catchError((err) => {
          log.error('Planning udc withdraw failed', err);
          return of(udcWithdraw.failure(err, action.meta));
        }),
      );
    }),
  );
};

export const udcCheckWithdrawPlannedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { userDepositContract, address }: RaidenEpicDeps,
): Observable<udcWithdrawPlanned> => {
  return action$.pipe(
    filter(newBlock.is),
    first(),
    concatMap(() =>
      from(userDepositContract.functions.withdraw_plans(address)).pipe(
        filter((value) => value.withdraw_block.gt(Zero)),
        map(({ amount, withdraw_block }) =>
          udcWithdrawPlanned(
            {
              block: withdraw_block.toNumber(),
            },
            {
              amount: amount as UInt<32>,
            },
          ),
        ),
      ),
    ),
  );
};

export const udcWithdrawPlannedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, userDepositContract, address, signer }: RaidenEpicDeps,
): Observable<udcWithdraw.success | udcWithdraw.failure> => {
  return action$.pipe(filter(udcWithdrawPlanned.is)).pipe(
    mergeMap((action) =>
      state$.pipe(
        pluck('blockNumber'),
        first((blockNumber) => action.payload.block <= blockNumber),
        map(() => action),
      ),
    ),
    withLatestFrom(from(userDepositContract.functions.balances(address))),
    concatMap(([action, balance]) => {
      try {
        assert(balance.gt(Zero), [
          ErrorCodes.UDC_PLAN_WITHDRAW_NO_BALANCE,
          {
            balance: balance.toString(),
          },
        ]);
      } catch (e) {
        return of(udcWithdraw.failure(e, { amount: action.meta.amount }));
      }
      const contract = getContractWithSigner(userDepositContract, signer);
      return from(contract.functions.withdraw(action.meta.amount)).pipe(
        assertTx('withdraw', ErrorCodes.UDC_WITHDRAW_FAILED, { log }),
        concatMap((txHash) => {
          return from(contract.functions.balances(address)).pipe(
            map((newBalance) =>
              udcWithdraw.success(
                {
                  txHash,
                  withdrawal: balance.sub(newBalance) as UInt<32>,
                },
                {
                  amount: action.meta.amount,
                },
              ),
            ),
          );
        }),
        catchError((err) => {
          log.error('Error when processing the withdraw plan', err);
          return of(udcWithdraw.failure(err, { amount: action.meta.amount }));
        }),
      );
    }),
  );
};
