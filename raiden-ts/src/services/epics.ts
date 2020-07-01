import * as t from 'io-ts';
import { defer, EMPTY, from, merge, Observable, of, combineLatest, timer } from 'rxjs';
import {
  catchError,
  concatMap,
  delay,
  debounceTime,
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
  take,
  mapTo,
  debounce,
  pairwise,
} from 'rxjs/operators';
import { fromFetch } from 'rxjs/fetch';
import { Event } from 'ethers/contract';
import { BigNumber, bigNumberify, toUtf8Bytes, verifyMessage, concat } from 'ethers/utils';
import { Two, Zero, MaxUint256, WeiPerEther } from 'ethers/constants';
import memoize from 'lodash/memoize';

import { UserDeposit } from '../contracts/UserDeposit';
import { RaidenAction } from '../actions';
import { RaidenState } from '../state';
import { RaidenEpicDeps, Latest } from '../types';
import { messageGlobalSend } from '../messages/actions';
import { MessageType, PFSCapacityUpdate, PFSFeeUpdate, MonitorRequest } from '../messages/types';
import { MessageTypeId, signMessage, createBalanceHash } from '../messages/utils';
import { ChannelState, Channel } from '../channels/state';
import { assertTx, channelAmounts, groupChannel$ } from '../channels/utils';
import { Address, decode, Int, Signature, Signed, UInt, isntNil, Hash } from '../utils/types';
import { isActionOf } from '../utils/actions';
import { encode, losslessParse, losslessStringify } from '../utils/data';
import { getEventsStream } from '../utils/ethers';
import { RaidenError, ErrorCodes, assert } from '../utils/error';
import { pluckDistinct } from '../utils/rx';
import { Capabilities } from '../constants';
import { getContractWithSigner } from '../helpers';

import {
  iouClear,
  pathFind,
  iouPersist,
  pfsListUpdated,
  udcDeposited,
  udcWithdraw,
  udcWithdrawn,
  msBalanceProofSent,
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

interface PathError extends t.TypeOf<typeof PathError> {}

interface Route {
  iou: Signed<IOU> | undefined;
  paths?: Paths;
  error?: PathError;
}

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
  return action$.pipe(
    filter(isActionOf(pathFind.request)),
    concatMap((action) =>
      deps.latest$.pipe(
        first(),
        mergeMap((latest) => getRoute$(action, deps, latest)),
        withLatestFrom(deps.latest$),
        mergeMap(([route, latest]) => validateRoute$(action, deps, route, latest)),
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
 * @param deps.config$ - Config observable
 * @returns Observable of messageGlobalSend actions
 */
export const pfsCapacityUpdateEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, address, network, signer, config$ }: RaidenEpicDeps,
): Observable<messageGlobalSend> =>
  state$.pipe(
    groupChannel$,
    mergeMap((grouped$) =>
      grouped$.pipe(
        pairwise(), // skips first emission on startup
        withLatestFrom(config$),
        // ignore actions if channel not open or while/if config.pfsRoom isn't set
        filter(([[, channel], { pfsRoom }]) => channel.state === ChannelState.open && !!pfsRoom),
        debounce(
          ([[prev, cur], { httpTimeout }]) =>
            cur.own.locks.length > prev.own.locks.length ||
            cur.partner.locks.length > prev.partner.locks.length
              ? // if either lock increases, a transfer is pending, debounce by httpTimeout=30s
                timer(httpTimeout)
              : of(1), // otherwise, deposited or a transfer completed, fires immediatelly
        ),
        switchMap(([[, channel], { revealTimeout, pfsRoom }]) => {
          const tokenNetwork = channel.tokenNetwork;
          const partner = channel.partner.address;
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
 * @param action$ - Observable of channelMonitored actions
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
    filter(
      ([channel, { pfsRoom, caps }]) =>
        channel.state === ChannelState.open && !!pfsRoom && !caps?.[Capabilities.NO_MEDIATE],
    ),
    mergeMap(([channel, { pfsRoom }]) => {
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
 * @returns An operator which receives prev and current Channel states and returns a cold
 *      Observable of messageGlobalSend actions to the global monitoring room
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
  return ([, channel]: [Channel, Channel]) => {
    const { partnerUnlocked, ownDeposit } = channelAmounts(channel);
    // give up early if nothing to lose
    if (partnerUnlocked.isZero() || ownDeposit.isZero()) return EMPTY;

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
            // default rate=MaxUint256 means it'll ALWAYS monitor if no rate is set for token
            .mul(rateToSvt[channel.token] ?? MaxUint256)
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
          (a, b) =>
            b.partner.balanceProof.transferredAmount.eq(
              a.partner.balanceProof.transferredAmount,
            ) &&
            b.partner.balanceProof.lockedAmount.eq(a.partner.balanceProof.lockedAmount) &&
            b.partner.locks === a.partner.locks,
        ),
        pairwise(), // distinctUntilChanged allows first, so pair and skips it
        debounce(([prev, cur]) =>
          // if partner lock increases, a transfer is pending, debounce by httpTimeout=30s
          // otherwise transfer completed, emits immediately
          cur.partner.locks.length > prev.partner.locks.length ? timer(httpTimeout) : of(1),
        ),
        // switchMap may unsubscribe from previous udcBalance wait/signature prompts if partner's
        // balanceProof balance changes in the meantime
        switchMap(makeMonitoringRequest$(deps)),
      ),
    ),
  );

export const udcWithdrawRequestEpic = (
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { userDepositContract, address, log, signer }: RaidenEpicDeps,
): Observable<udcWithdraw.success | udcWithdraw.failure> =>
  action$.pipe(
    filter(udcWithdraw.request.is),
    mergeMap((action) =>
      userDepositContract.functions
        .balances(address)
        .then((balance) => [action, balance] as const),
    ),
    concatMap(([action, balance]) => {
      const contract = getContractWithSigner(userDepositContract, signer);
      const amount = action.meta.amount;
      return defer(() => {
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

        return contract.functions.planWithdraw(amount);
      }).pipe(
        assertTx('planWithdraw', ErrorCodes.UDC_PLAN_WITHDRAW_FAILED, { log }),
        mergeMap(({ transactionHash: txHash, blockNumber: txBlock }) =>
          from(userDepositContract.functions.withdraw_plans(address)).pipe(
            map(({ amount, withdraw_block }) =>
              udcWithdraw.success(
                {
                  block: withdraw_block.toNumber(),
                  txHash,
                  txBlock,
                  confirmed: undefined,
                },
                { amount: amount as UInt<32> },
              ),
            ),
          ),
        ),
        catchError((err) => {
          log.error('Planning udc withdraw failed', err);
          return of(udcWithdraw.failure(err, action.meta));
        }),
      );
    }),
  );

export const udcCheckWithdrawPlannedEpic = (
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { userDepositContract, address }: RaidenEpicDeps,
): Observable<udcWithdraw.success> => {
  return defer(() => userDepositContract.functions.withdraw_plans(address)).pipe(
    filter((value) => value.withdraw_block.gt(Zero)),
    map(({ amount, withdraw_block }) =>
      udcWithdraw.success(
        { block: withdraw_block.toNumber(), confirmed: true },
        { amount: amount as UInt<32> },
      ),
    ),
  );
};

export const udcWithdrawPlannedEpic = (
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, userDepositContract, address, signer }: RaidenEpicDeps,
): Observable<udcWithdrawn | udcWithdraw.failure> => {
  return action$.pipe(
    filter(udcWithdraw.success.is),
    filter((action) => action.payload.confirmed === true),
    mergeMap((action) =>
      state$.pipe(
        pluck('blockNumber'),
        first((blockNumber) => action.payload.block < blockNumber),
        mapTo(action),
      ),
    ),
    mergeMap((action) =>
      userDepositContract.functions
        .balances(address)
        .then((balance) => [action, balance] as const),
    ),
    concatMap(([action, balance]) => {
      const contract = getContractWithSigner(userDepositContract, signer);
      return defer(() => {
        assert(balance.gt(Zero), [
          ErrorCodes.UDC_WITHDRAW_NO_BALANCE,
          {
            balance: balance.toString(),
          },
        ]);
        return contract.functions.withdraw(action.meta.amount);
      }).pipe(
        assertTx('withdraw', ErrorCodes.UDC_WITHDRAW_FAILED, { log }),
        concatMap(({ transactionHash, blockNumber }) =>
          defer(() => contract.functions.balances(address)).pipe(
            map((newBalance) =>
              udcWithdrawn(
                {
                  withdrawal: balance.sub(newBalance) as UInt<32>,
                  txHash: transactionHash,
                  txBlock: blockNumber,
                  confirmed: undefined,
                },
                action.meta,
              ),
            ),
          ),
        ),
        catchError((err) => {
          log.error('Error when processing the withdraw plan', err);
          return of(udcWithdraw.failure(err, action.meta));
        }),
      );
    }),
  );
};

/**
 * Monitors MonitoringService contract and fires events when an MS sent a BP in our behalf.
 *
 * When this epic is subscribed (startup), it fetches events since 'provider.resetEventsBlock',
 * which is set to latest monitored block, so on startup we always pick up events that were fired
 * while offline, and keep monitoring while online, although it isn't probable that MS would quick
 * in while we're online, since [[channelUpdateEpic]] would update the channel ourselves.
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.monitoringServiceContract - MonitoringService contract instance
 * @param deps.address - Our address
 * @returns Observable of msBalanceProofSent actions
 */
export const msMonitorNewBPEpic = (
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { monitoringServiceContract, address }: RaidenEpicDeps,
): Observable<msBalanceProofSent> => {
  // NewBalanceProofReceived event: [tokenNetwork, channelId, reward, nonce, monitoringService, ourAddress]
  return getEventsStream<[Address, UInt<32>, UInt<32>, UInt<8>, Address, Address, Event]>(
    monitoringServiceContract,
    [
      monitoringServiceContract.filters.NewBalanceProofReceived(
        null,
        null,
        null,
        null,
        null,
        address,
      ),
    ],
    // no fromBlock, since we want to always track since 'resetEventsBlock'
  ).pipe(
    // should never fail, as per filter
    filter(([, , , , , raidenAddress]) => raidenAddress === address),
    withLatestFrom(state$),
    map(([[tokenNetwork, id, reward, nonce, monitoringService, , event], state]) => {
      const channel = Object.values(state.channels)
        .concat(Object.values(state.oldChannels))
        .find((c) => c.tokenNetwork === tokenNetwork && id.eq(c.id));
      if (!channel) return;
      return msBalanceProofSent({
        tokenNetwork,
        partner: channel.partner.address,
        id: channel.id,
        reward,
        nonce,
        monitoringService,
        txHash: event.transactionHash as Hash,
        txBlock: event.blockNumber!,
        confirmed: undefined,
      });
    }),
    filter(isntNil),
  );
};

function getRoute$(
  action: pathFind.request,
  deps: RaidenEpicDeps,
  latest: Latest,
): Observable<{ paths?: Paths; iou: Signed<IOU> | undefined; error?: PathError }> {
  validateRouteTargetAndEventuallyThrow(action, latest);

  if (action.payload.paths) {
    return of({ paths: action.payload.paths, iou: undefined });
  } else if (directTransferIsPossible(action, latest)) {
    return of({
      paths: [{ path: [deps.address, action.meta.target], fee: Zero as Int<32> }],
      iou: undefined,
    });
  } else if (pfsIsDisabled(action, latest)) {
    throw new RaidenError(ErrorCodes.PFS_DISABLED);
  } else {
    return getRouteFromPfs$(action, deps, latest);
  }
}

function validateRoute$(
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

      const filteredPaths = filterPaths(action, deps, latest, paths);

      if (filteredPaths.length) {
        yield pathFind.success({ paths: filteredPaths }, action.meta);
      } else {
        throw new RaidenError(ErrorCodes.PFS_NO_ROUTES_FOUND);
      }
    })(),
  );
}

function validateRouteTargetAndEventuallyThrow(action: pathFind.request, latest: Latest): void {
  const { tokenNetwork, target } = action.meta;
  const { state, presences } = latest;

  if (!Object.values(state.tokens).includes(tokenNetwork))
    throw new RaidenError(ErrorCodes.PFS_UNKNOWN_TOKEN_NETWORK, { tokenNetwork });

  if (!(target in presences) || !presences[target].payload.available)
    throw new RaidenError(ErrorCodes.PFS_TARGET_OFFLINE, { target });

  if (presences[target].payload.caps?.[Capabilities.NO_RECEIVE])
    throw new RaidenError(ErrorCodes.PFS_TARGET_NO_RECEIVE, { target });
}

function pfsIsDisabled(action: pathFind.request, latest: Latest): boolean {
  const disabledByAction = action.payload.pfs === null;
  const disabledByConfig = !action.payload.pfs && latest.config.pfs === null;
  return disabledByAction || disabledByConfig;
}

function getRouteFromPfs$(
  action: pathFind.request,
  deps: RaidenEpicDeps,
  latest: Latest,
): Observable<Route> {
  const { tokenNetwork, target, value } = action.meta;

  return getPsfInfo$(action.payload.pfs, latest.config.pfs, deps).pipe(
    mergeMap((pfs) => getIouForPfs(pfs, tokenNetwork, deps)),
    mergeMap(({ pfs, iou }) =>
      requestPfs$(
        pfs,
        iou,
        tokenNetwork,
        deps.address,
        target,
        UInt(32).encode(value),
        latest.config.httpTimeout,
      ),
    ),
    map(({ pfsResponse, responseText, iou }) =>
      parsePfsResponse(pfsResponse, responseText, iou, latest.config.pfsSafetyMargin),
    ),
  );
}

function filterPaths(
  action: pathFind.request,
  deps: RaidenEpicDeps,
  latest: Latest,
  paths: Paths | undefined,
): Paths {
  const { address, log } = deps;
  const filteredPaths: Paths = [];
  const invalidatedRecipients = new Set<Address>();

  if (paths) {
    for (const { path, fee } of paths) {
      const cleanPath = getCleanPath(path, address);
      const recipient = cleanPath[0];
      let shouldSelectPath = false;
      let reasonToNotSelect = '';

      if (invalidatedRecipients.has(recipient)) continue;
      if (filteredPaths.length === 0) {
        shouldSelectPath = directTransferIsPossible(action, latest, recipient);
      } else if (recipient !== filteredPaths[0].path[0]) {
        reasonToNotSelect = 'path: already selected another recipient';
      } else if (fee.gt(filteredPaths[0].fee)) {
        reasonToNotSelect = 'path: already selected a smaller fee';
      } else {
        shouldSelectPath = true;
      }

      if (shouldSelectPath) {
        filteredPaths.push({ path: cleanPath, fee });
      } else {
        log.warn('Invalidated received route. Reason:', reasonToNotSelect, 'Route:', cleanPath);
        invalidatedRecipients.add(recipient);
      }
    }
  }

  return filteredPaths;
}

function getPsfInfo$(
  pfsByAction: PFS | null | undefined,
  pfsByConfig: string | Address | null,
  deps: RaidenEpicDeps,
): Observable<PFS> {
  if (pfsByAction) return of(pfsByAction);
  else if (pfsByConfig) return pfsInfo(pfsByConfig, deps);
  else {
    const { log, latest$ } = deps;
    return latest$.pipe(
      pluck('pfsList'), // get cached pfsList
      first((pfsList) => pfsList.length > 0), // if needed, wait for list to be populated
      mergeMap((pfsList) => pfsListInfo(pfsList, deps)), // fetch pfsInfo from whole list & sort it
      tap((pfsInfos) => log.info('Auto-selecting best PFS from:', pfsInfos)),
      pluck(0), // pop best ranked
    );
  }
}

function getIouForPfs(
  pfs: PFS,
  tokenNetwork: Address,
  deps: RaidenEpicDeps,
): Observable<{ pfs: PFS; iou: Signed<IOU> | undefined }> {
  if (pfs.price.isZero()) {
    return of({ pfs, iou: undefined });
  } else {
    return prepareNextIOU$(pfs, tokenNetwork, deps).pipe(map((iou) => ({ pfs, iou })));
  }
}

function requestPfs$(
  pfs: PFS,
  iou: Signed<IOU> | undefined,
  tokenNetwork: Address,
  address: Address,
  target: Address,
  value: string,
  httpTimeout: number,
): Observable<{ pfsResponse: Response; responseText: string; iou: Signed<IOU> | undefined }> {
  const body = losslessStringify({
    from: address,
    to: target,
    value: value,
    max_paths: 10,
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
    map((pfsResponse) => ({ pfsResponse, iou })),
    mergeMap(async ({ pfsResponse, iou }) => ({
      pfsResponse,
      responseText: await pfsResponse.text(),
      iou,
    })),
  );
}

function parsePfsResponse(
  pfsResponse: Response,
  responseText: string,
  iou: Signed<IOU> | undefined,
  pfsSafetyMargin: number,
): Route {
  // any decode error here will throw early and end up in catchError
  const data = losslessParse(responseText);

  if (!pfsResponse.ok) {
    const error = decode(PathError, data);
    return { iou, error };
  } else {
    const results = decode(PathResults, data).result;
    const paths = results.map(({ path, estimated_fee }) => {
      const fee = estimated_fee.mul(Math.round(pfsSafetyMargin * 1e6)).div(1e6) as Int<32>;
      return { path, fee } as const;
    });
    return { paths, iou };
  }
}

function directTransferIsPossible(
  action: pathFind.request,
  latest: Latest,
  recipient?: Address,
): boolean {
  const { tokenNetwork, target, value } = action.meta;
  const { state, presences } = latest;
  return (
    channelCanRoute(state, presences, tokenNetwork, recipient ?? target, target, value) === true
  );
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
