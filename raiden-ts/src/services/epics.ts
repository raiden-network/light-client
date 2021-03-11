import { BigNumber } from '@ethersproject/bignumber';
import { concat as concatBytes } from '@ethersproject/bytes';
import { MaxUint256, WeiPerEther, Zero } from '@ethersproject/constants';
import { toUtf8Bytes } from '@ethersproject/strings';
import { verifyMessage } from '@ethersproject/wallet';
import BN from 'bignumber.js';
import * as t from 'io-ts';
import constant from 'lodash/constant';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import pickBy from 'lodash/pickBy';
import type { Observable } from 'rxjs';
import { AsyncSubject, combineLatest, defer, EMPTY, from, merge, of, timer } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import {
  catchError,
  concatMap,
  debounce,
  distinctUntilChanged,
  exhaustMap,
  filter,
  first,
  map,
  mapTo,
  mergeMap,
  pairwise,
  pluck,
  startWith,
  switchMap,
  take,
  takeUntil,
  tap,
  timeout,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../actions';
import { newBlock } from '../channels/actions';
import type { Channel } from '../channels/state';
import { ChannelState } from '../channels/state';
import { approveIfNeeded$, assertTx, channelAmounts, groupChannel$ } from '../channels/utils';
import type { RaidenConfig } from '../config';
import { intervalFromConfig } from '../config';
import { Capabilities } from '../constants';
import type { HumanStandardToken, UserDeposit } from '../contracts';
import { chooseOnchainAccount, getContractWithSigner } from '../helpers';
import { messageServiceSend } from '../messages/actions';
import type { MonitorRequest, PFSCapacityUpdate, PFSFeeUpdate } from '../messages/types';
import { MessageType } from '../messages/types';
import { createBalanceHash, MessageTypeId, signMessage } from '../messages/utils';
import type { RaidenState } from '../state';
import { makeMessageId } from '../transfers/utils';
import { matrixPresence } from '../transport/actions';
import type { Presences } from '../transport/types';
import { getCap } from '../transport/utils';
import type { Latest, RaidenEpicDeps } from '../types';
import { isActionOf, isResponseOf } from '../utils/actions';
import { encode, jsonParse, jsonStringify } from '../utils/data';
import { assert, commonTxErrors, ErrorCodes, networkErrors, RaidenError } from '../utils/error';
import { fromEthersEvent, logToContractEvent } from '../utils/ethers';
import {
  completeWith,
  lastMap,
  mergeWith,
  pluckDistinct,
  retryAsync$,
  retryWhile,
} from '../utils/rx';
import type { Address, Hash, Signature, Signed } from '../utils/types';
import { decode, Int, isntNil, UInt } from '../utils/types';
import {
  iouClear,
  iouPersist,
  msBalanceProofSent,
  pathFind,
  servicesValid,
  udcDeposit,
  udcWithdraw,
  udcWithdrawn,
} from './actions';
import type { IOU, Paths, PFS } from './types';
import { LastIOUResults, PathResults, Service } from './types';
import { channelCanRoute, packIOU, pfsInfo, pfsListInfo, signIOU } from './utils';

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
 * Check if a transfer can be made and return a set of paths for it.
 *
 * @param action$ - Observable of pathFind.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - RaidenEpicDeps object
 * @returns Observable of pathFind.{success|failure} actions
 */
export function pathFindServiceEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<
  matrixPresence.request | pathFind.success | pathFind.failure | iouPersist | iouClear
> {
  return action$.pipe(
    filter(isActionOf(pathFind.request)),
    concatMap((action) =>
      deps.latest$.pipe(
        first(),
        mergeMap((latest) => {
          const { target } = action.meta;
          let presenceRequest: Observable<matrixPresence.request>;
          let latestWithTargetInPresences: Observable<Latest>;

          if (target in latest.presences) {
            presenceRequest = EMPTY;
            latestWithTargetInPresences = of(latest);
          } else {
            presenceRequest = of(matrixPresence.request(undefined, { address: target }));
            latestWithTargetInPresences = waitForMatrixPresenceResponse$(action$, deps, target);
          }

          return merge(
            latestWithTargetInPresences.pipe(
              mergeMap((latest) => getRoute$(action, deps, latest)),
              withLatestFrom(deps.latest$),
              mergeMap(([route, latest]) => validateRoute$(action, deps, route, latest)),
              catchError((err) => of(pathFind.failure(err, action.meta))),
            ),
            presenceRequest,
          );
        }),
      ),
    ),
  );
}

/**
 * Sends a [[PFSCapacityUpdate]] to PFSs on new deposit on our side of channels
 *
 * @param action$ - Observable of channelDeposit.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.log - Logger instance
 * @param deps.address - Our address
 * @param deps.network - Current Network
 * @param deps.signer - Signer instance
 * @param deps.config$ - Config observable
 * @returns Observable of messageServiceSend.request actions
 */
export function pfsCapacityUpdateEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, address, network, signer, config$ }: RaidenEpicDeps,
): Observable<messageServiceSend.request> {
  return state$.pipe(
    groupChannel$,
    mergeMap((grouped$) =>
      grouped$.pipe(
        pairwise(), // skips first emission on startup
        withLatestFrom(config$),
        // ignore actions if channel not open or while/if pfs is disabled
        filter(([[, channel], { pfs }]) => channel.state === ChannelState.open && pfs !== null),
        debounce(
          ([[prev, cur], { httpTimeout }]) =>
            cur.own.locks.length > prev.own.locks.length ||
            cur.partner.locks.length > prev.partner.locks.length
              ? // if either lock increases, a transfer is pending, debounce by httpTimeout=30s
                timer(httpTimeout)
              : of(1), // otherwise, deposited or a transfer completed, fires immediatelly
        ),
        switchMap(([[, channel], { revealTimeout }]) => {
          const tokenNetwork = channel.tokenNetwork;
          const partner = channel.partner.address;
          const { ownCapacity, partnerCapacity } = channelAmounts(channel);

          const message: PFSCapacityUpdate = {
            type: MessageType.PFS_CAPACITY_UPDATE,
            canonical_identifier: {
              chain_identifier: BigNumber.from(network.chainId) as UInt<32>,
              token_network_address: tokenNetwork,
              channel_identifier: BigNumber.from(channel.id) as UInt<32>,
            },
            updating_participant: address,
            other_participant: partner,
            updating_nonce: channel.own.balanceProof.nonce,
            other_nonce: channel.partner.balanceProof.nonce,
            updating_capacity: ownCapacity,
            other_capacity: partnerCapacity,
            reveal_timeout: BigNumber.from(revealTimeout) as UInt<32>,
          };
          const msgId = makeMessageId().toString();

          return defer(() => signMessage(signer, message, { log })).pipe(
            map((signed) =>
              messageServiceSend.request({ message: signed }, { service: Service.PFS, msgId }),
            ),
            catchError((err) => {
              log.error('Error trying to generate & sign PFSCapacityUpdate', err);
              return EMPTY;
            }),
          );
        }),
      ),
    ),
  );
}

/**
 * When monitoring a channel (either a new channel or a previously monitored one), send a matching
 * PFSFeeUpdate to PFSs, so they can pick us for mediation
 *
 * @param action$ - Observable of channelMonitored actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Raiden epic dependencies
 * @param deps.log - Logger instance
 * @param deps.address - Our address
 * @param deps.network - Current network
 * @param deps.signer - Signer instance
 * @param deps.config$ - Config observable
 * @param deps.mediationFeeCalculator - Calculator for mediation fees schedule
 * @returns Observable of messageServiceSend.request actions
 */
export function pfsFeeUpdateEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, address, network, signer, config$, mediationFeeCalculator }: RaidenEpicDeps,
): Observable<messageServiceSend.request> {
  return state$.pipe(
    groupChannel$,
    mergeMap((grouped$) =>
      combineLatest([
        grouped$,
        config$.pipe(pluckDistinct('caps')),
        config$.pipe(pluckDistinct('mediationFees')),
      ]).pipe(
        filter(([, caps]) => !!getCap(caps, Capabilities.MEDIATE)),
        map(([channel, , mediationFees]) => {
          const schedule: PFSFeeUpdate['fee_schedule'] = {
            cap_fees: true,
            flat: Zero as Int<32>,
            proportional: Zero as Int<32>,
            imbalance_penalty: null,
            ...mediationFeeCalculator.emptySchedule,
          };
          Object.assign(schedule, mediationFeeCalculator.schedule(mediationFees, channel));
          // using channel feeSchedule above, build a PFSFeeUpdate's schedule payload
          return [channel, schedule] as const;
        }),
        // reactive on channel state and config changes, distinct on schedule's payload
        distinctUntilChanged(([, sched1], [, sched2]) => isEqual(sched1, sched2)),
        switchMap(([channel, schedule]) => {
          const message: PFSFeeUpdate = {
            type: MessageType.PFS_FEE_UPDATE,
            canonical_identifier: {
              chain_identifier: BigNumber.from(network.chainId) as UInt<32>,
              token_network_address: channel.tokenNetwork,
              channel_identifier: BigNumber.from(channel.id) as UInt<32>,
            },
            updating_participant: address,
            timestamp: makeTimestamp(),
            fee_schedule: schedule,
          };
          const msgId = makeMessageId().toString();
          const meta = { service: Service.PFS, msgId };

          return from(signMessage(signer, message, { log })).pipe(
            map((signed) => messageServiceSend.request({ message: signed }, meta)),
            catchError((err) => {
              log.error('Error trying to generate & sign PFSFeeUpdate', err);
              return EMPTY;
            }),
          );
        }),
        takeUntil(grouped$.pipe(filter((channel) => channel.state !== ChannelState.open))),
      ),
    ),
    completeWith(state$),
  );
}

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
 * @param deps.provider - Provider instance
 * @param deps.serviceRegistryContract - ServiceRegistry contract instance
 * @param deps.contractsInfo - Contracts info mapping
 * @param deps.config$ - Config observable
 * @param deps.init$ - Init$ tasks subject
 * @returns Observable of servicesValid actions
 */
export function pfsServiceRegistryMonitorEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { provider, serviceRegistryContract, contractsInfo, config$, init$ }: RaidenEpicDeps,
): Observable<servicesValid> {
  const blockNumber$ = action$.pipe(filter(newBlock.is), pluck('payload', 'blockNumber'));
  return state$.pipe(
    first(),
    switchMap(({ services: initialServices }) => {
      const initSub = new AsyncSubject<null>();
      init$.next(initSub);
      return fromEthersEvent(
        provider,
        serviceRegistryContract.filters.RegisteredService(null, null, null, null),
        {
          // if initialServices is empty, fetch since registry deploy block, else, resetEventsBlock
          fromBlock: isEmpty(initialServices)
            ? contractsInfo.TokenNetworkRegistry.block_number
            : undefined,
          confirmations: config$.pipe(pluck('confirmationBlocks')),
          blockNumber$,
          onPastCompleted: () => {
            initSub.next(null);
            initSub.complete();
          },
        },
      )
        .pipe(
          withLatestFrom(state$, config$),
          filter(
            ([{ blockNumber: eventBlock }, { blockNumber }, { confirmationBlocks }]) =>
              !!eventBlock && eventBlock + confirmationBlocks <= blockNumber,
          ),
          pluck(0),
          map(logToContractEvent(serviceRegistryContract)),
          withLatestFrom(state$),
          // merge new entry with stored state
          map(([[service, valid_till], { services }]) => ({
            ...services,
            [service]: valid_till.toNumber() * 1000,
          })),
        )
        .pipe(
          startWith(initialServices),
          // switchMap with newBlock events ensure this filter gets re-evaluated every block
          // and filters out entries which aren't valid anymore
          switchMap((services) =>
            action$.pipe(
              filter(newBlock.is),
              startWith(true),
              map(() => pickBy(services, (till) => Date.now() < till)),
            ),
          ),
          distinctUntilChanged<typeof initialServices>(isEqual),
          map((valid) => servicesValid(valid)),
        );
    }),
    completeWith(action$),
  );
}

/**
 * Monitors the balance of UDC and emits udcDeposited, made available in Latest['udcBalance']
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.address - Our address
 * @param deps.latest$ - Latest observable
 * @param deps.userDepositContract - UserDeposit contract instance
 * @param deps.provider - Eth provider
 * @returns Observable of udcDeposited actions
 */
export function monitorUdcBalanceEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { address, latest$, provider, userDepositContract }: RaidenEpicDeps,
): Observable<udcDeposit.success> {
  return action$.pipe(
    filter(newBlock.is),
    startWith(null),
    // it's seems ugly to call on each block, but UserDepositContract doesn't expose deposits as
    // events, and ethers actually do that to monitor token balances, so it's equivalent
    exhaustMap(() =>
      /* This contract's function is pure (doesn't depend on user's confirmation, gas availability,
       * etc), but merged on the top-level observable, therefore connectivity issues can cause
       * exceptions which would shutdown the SDK. Let's swallow the error here, since this will be
       * retried on next block, which should only be emitted after connectivity is reestablished */
      retryAsync$(
        () =>
          Promise.all([
            userDepositContract.callStatic.effectiveBalance(address) as Promise<UInt<32>>,
            userDepositContract.callStatic.total_deposit(address) as Promise<UInt<32>>,
          ]),
        provider.pollingInterval,
        { onErrors: networkErrors },
      ).pipe(catchError(constant(EMPTY))),
    ),
    withLatestFrom(latest$),
    filter(([[balance], { udcBalance }]) => !udcBalance.eq(balance)),
    map(([[balance, totalDeposit]]) => udcDeposit.success({ balance }, { totalDeposit })),
  );
}

function makeUdcDeposit$(
  [tokenContract, userDepositContract]: [HumanStandardToken, UserDeposit],
  [sender, address]: [Address, Address],
  [deposit, totalDeposit]: [UInt<32>, UInt<32>],
  { pollingInterval, minimumAllowance }: RaidenConfig,
  { log, provider, config$ }: Pick<RaidenEpicDeps, 'log' | 'provider' | 'config$'>,
) {
  return retryAsync$(
    () =>
      Promise.all([
        tokenContract.callStatic.balanceOf(sender) as Promise<UInt<32>>,
        tokenContract.callStatic.allowance(sender, userDepositContract.address) as Promise<
          UInt<32>
        >,
        userDepositContract.callStatic.total_deposit(address),
      ]),
    pollingInterval,
    { onErrors: networkErrors },
  ).pipe(
    mergeMap(([balance, allowance, deposited]) => {
      assert(deposited.add(deposit).eq(totalDeposit), [
        ErrorCodes.UDC_DEPOSIT_OUTDATED,
        { requested: totalDeposit.toString(), current: deposited.toString() },
      ]);
      return approveIfNeeded$(
        [balance, allowance, deposit],
        tokenContract,
        userDepositContract.address as Address,
        ErrorCodes.RDN_APPROVE_TRANSACTION_FAILED,
        { provider },
        { log, minimumAllowance },
      );
    }),
    // send setTotalDeposit transaction
    mergeMap(() => userDepositContract.deposit(address, totalDeposit)),
    assertTx('deposit', ErrorCodes.RDN_DEPOSIT_TRANSACTION_FAILED, { log, provider }),
    // retry also txFail errors, since estimateGas can lag behind just-opened channel or
    // just-approved allowance
    retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.debug }),
  );
}

/**
 * Handles a udcDeposit.request and deposit SVT/RDN to UDC
 *
 * @param action$ - Observable of udcDeposit.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.userDepositContract - UserDeposit contract instance
 * @param deps.getTokenContract - Factory for Token contracts
 * @param deps.address - Our address
 * @param deps.log - Logger instance
 * @param deps.signer - Signer
 * @param deps.main - Main Signer/Address
 * @param deps.config$ - Config observable
 * @param deps.provider - Eth provider
 * @returns - Observable of udcDeposit.failure|udcDeposit.success actions
 */
export function udcDepositEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  {
    userDepositContract,
    getTokenContract,
    address,
    log,
    signer,
    main,
    config$,
    provider,
  }: RaidenEpicDeps,
): Observable<udcDeposit.failure | udcDeposit.success> {
  return action$.pipe(
    filter(udcDeposit.request.is),
    concatMap((action) =>
      retryAsync$(
        () => userDepositContract.callStatic.token() as Promise<Address>,
        provider.pollingInterval,
        { onErrors: networkErrors },
      ).pipe(
        withLatestFrom(config$),
        mergeMap(([token, config]) => {
          const { signer: onchainSigner, address: onchainAddress } = chooseOnchainAccount(
            { signer, address, main },
            action.payload.subkey ?? config.subkey,
          );
          const tokenContract = getContractWithSigner(getTokenContract(token), onchainSigner);
          const udcContract = getContractWithSigner(userDepositContract, onchainSigner);

          return makeUdcDeposit$(
            [tokenContract, udcContract],
            [onchainAddress, address],
            [action.payload.deposit, action.meta.totalDeposit],
            config,
            { log, provider, config$ },
          );
        }),
        mergeMap(([, receipt]) =>
          retryAsync$(
            () => userDepositContract.callStatic.effectiveBalance(address) as Promise<UInt<32>>,
            provider.pollingInterval,
            { onErrors: networkErrors },
          ).pipe(
            map((balance) =>
              udcDeposit.success(
                {
                  balance,
                  txHash: receipt.transactionHash,
                  txBlock: receipt.blockNumber,
                  confirmed: undefined, // let confirmationEpic confirm this action
                },
                action.meta,
              ),
            ),
          ),
        ),
        catchError((error) => of(udcDeposit.failure(error, action.meta))),
      ),
    ),
  );
}

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
 *      Observable of messageServiceSend.request actions to monitoring services
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
    const { partnerUnlocked } = channelAmounts(channel);
    // give up early if nothing to lose
    if (partnerUnlocked.isZero()) return EMPTY;

    return combineLatest([latest$, config$]).pipe(
      // combineLatest + filter ensures it'll pass if anything here changes
      filter(
        ([{ udcBalance }, { monitoringReward, rateToSvt }]) =>
          // ignore actions while/if config.monitoringReward isn't enabled
          !!monitoringReward?.gt(Zero) &&
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
      mergeMap(([, { monitoringReward }]) => {
        const balanceProof = channel.partner.balanceProof;
        const balanceHash = createBalanceHash(balanceProof);

        const nonClosingMessage = concatBytes([
          encode(channel.tokenNetwork, 20),
          encode(network.chainId, 32),
          encode(MessageTypeId.BALANCE_PROOF_UPDATE, 32),
          encode(channel.id, 32),
          encode(balanceHash, 32),
          encode(balanceProof.nonce, 32),
          encode(balanceProof.additionalHash, 32),
          encode(balanceProof.signature, 65), // partner's signature for this balance proof
        ]); // UInt8Array of 277 bytes
        const msgId = makeMessageId().toString();

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
                  channel_identifier: BigNumber.from(channel.id) as UInt<32>,
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
          map((message) =>
            messageServiceSend.request({ message }, { service: Service.MS, msgId }),
          ),
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
 * @returns Observable of messageServiceSend.request actions
 */
export function monitorRequestEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<messageServiceSend.request> {
  return state$.pipe(
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
}

/**
 * Handle a UDC withdraw request and send plan transaction
 *
 * @param action$ - Observable of udcWithdraw.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.userDepositContract - UDC contract instance
 * @param deps.address - Our address
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.provider - Provider instance
 * @param deps.config$ - Config observable
 * @returns Observable of udcWithdraw.success|udcWithdraw.failure actions
 */
export function udcWithdrawRequestEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { userDepositContract, address, log, signer, provider, config$ }: RaidenEpicDeps,
): Observable<udcWithdraw.success | udcWithdraw.failure> {
  return action$.pipe(
    filter(udcWithdraw.request.is),
    mergeMap((action) =>
      retryAsync$(
        () =>
          userDepositContract.callStatic
            .balances(address)
            .then((balance) => [action, balance] as const),
        provider.pollingInterval,
        { onErrors: networkErrors },
      ),
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

        return contract.planWithdraw(amount);
      }).pipe(
        assertTx('planWithdraw', ErrorCodes.UDC_PLAN_WITHDRAW_FAILED, { log, provider }),
        retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.debug }),
        mergeMap(([, { transactionHash: txHash, blockNumber: txBlock }]) =>
          state$.pipe(
            pluckDistinct('blockNumber'),
            exhaustMap(() =>
              retryAsync$(
                () => userDepositContract.callStatic.withdraw_plans(address),
                provider.pollingInterval,
                { onErrors: networkErrors },
              ),
            ),
            first(({ amount }) => amount.gte(action.meta.amount)),
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
}

/**
 * At startup, check if there was a previous plan and re-emit udcWithdraw.success action
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.userDepositContract - UDC contract instance
 * @param deps.address - Our address
 * @param deps.config$ - Config observable
 * @returns Observable of udcWithdraw.success actions
 */
export function udcCheckWithdrawPlannedEpic(
  {}: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { userDepositContract, address, config$ }: RaidenEpicDeps,
): Observable<udcWithdraw.success> {
  return config$.pipe(
    first(),
    mergeMap(({ pollingInterval }) =>
      retryAsync$(() => userDepositContract.withdraw_plans(address), pollingInterval, {
        onErrors: networkErrors,
      }),
    ),
    filter((value) => value.withdraw_block.gt(Zero)),
    map(({ amount, withdraw_block }) =>
      udcWithdraw.success(
        { block: withdraw_block.toNumber(), confirmed: true },
        { amount: amount as UInt<32> },
      ),
    ),
  );
}

/**
 * When a plan is detected (done on this session or previous), wait until timeout and withdraw
 *
 * @param action$ - Observable of udcWithdraw.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.log - Logger instance
 * @param deps.userDepositContract - UDC contract instance
 * @param deps.address - Our address
 * @param deps.signer - Signer instance
 * @param deps.provider - Provider instance
 * @param deps.config$ - Config observable
 * @returns Observable of udcWithdrawn|udcWithdraw.failure actions
 */
export function udcWithdrawPlannedEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { log, userDepositContract, address, signer, provider, config$ }: RaidenEpicDeps,
): Observable<udcWithdrawn | udcWithdraw.failure> {
  return action$.pipe(
    filter(udcWithdraw.success.is),
    filter((action) => action.payload.confirmed === true),
    mergeMap((action) =>
      state$.pipe(
        pluck('blockNumber'),
        filter((blockNumber) => action.payload.block < blockNumber),
        take(1),
        mapTo(action),
      ),
    ),
    mergeMap((action) =>
      retryAsync$(
        () =>
          userDepositContract.callStatic
            .balances(address)
            .then((balance) => [action, balance] as const),
        provider.pollingInterval,
        { onErrors: networkErrors },
      ),
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
        return contract.withdraw(action.meta.amount);
      }).pipe(
        assertTx('withdraw', ErrorCodes.UDC_WITHDRAW_FAILED, { log, provider }),
        retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.debug }),
        concatMap(([, { transactionHash, blockNumber }]) =>
          state$.pipe(
            pluckDistinct('blockNumber'),
            exhaustMap(() =>
              retryAsync$(() => contract.callStatic.balances(address), provider.pollingInterval, {
                onErrors: networkErrors,
              }),
            ),
            filter((newBalance) => newBalance.lt(balance)),
            take(1),
            map((newBalance) =>
              udcWithdrawn(
                {
                  withdrawal: balance.sub(newBalance) as UInt<32>,
                  txHash: transactionHash,
                  txBlock: blockNumber,
                  confirmed: undefined, // let confirmationEpic confirm this, values only FYI
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
}

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
 * @param deps.provider - Provider instance
 * @param deps.monitoringServiceContract - MonitoringService contract instance
 * @param deps.address - Our address
 * @param deps.config$ - Config observable
 * @param deps.init$ - Subject of initial sync tasks
 * @returns Observable of msBalanceProofSent actions
 */
export function msMonitorNewBPEpic(
  action$: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  { provider, monitoringServiceContract, address, config$, init$ }: RaidenEpicDeps,
): Observable<msBalanceProofSent> {
  const initSub = new AsyncSubject<null>();
  init$.next(initSub);
  return fromEthersEvent(
    provider,
    monitoringServiceContract.filters.NewBalanceProofReceived(
      null,
      null,
      null,
      null,
      null,
      address,
    ),
    {
      confirmations: config$.pipe(pluck('confirmationBlocks')),
      blockNumber$: action$.pipe(filter(newBlock.is), pluck('payload', 'blockNumber')),
      onPastCompleted: () => {
        initSub.next(null);
        initSub.complete();
      },
    },
  ).pipe(
    completeWith(state$),
    map(logToContractEvent(monitoringServiceContract)),
    // should never fail, as per filter
    filter(([, , , , , raidenAddress]) => raidenAddress === address),
    withLatestFrom(state$, config$),
    map(
      ([
        [tokenNetwork, id, reward, nonce, monitoringService, , event],
        state,
        { confirmationBlocks },
      ]) => {
        const channel = Object.values(state.channels)
          .concat(Object.values(state.oldChannels))
          .find((c) => c.tokenNetwork === tokenNetwork && id.eq(c.id));
        const txBlock = event.blockNumber;
        if (!channel || !txBlock) return;
        return msBalanceProofSent({
          tokenNetwork: tokenNetwork as Address,
          partner: channel.partner.address,
          id: channel.id,
          reward: reward as UInt<32>,
          nonce: nonce as UInt<8>,
          monitoringService: monitoringService as Address,
          txHash: event.transactionHash as Hash,
          txBlock,
          confirmed: txBlock + confirmationBlocks <= state.blockNumber ? true : undefined,
        });
      },
    ),
    filter(isntNil),
  );
}

function waitForMatrixPresenceResponse$(
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

function getRoute$(
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

function pfsIsDisabled(action: pathFind.request, { pfs }: RaidenConfig): boolean {
  const disabledByAction = action.payload.pfs === null;
  const disabledByConfig = !action.payload.pfs && pfs === null;
  return disabledByAction || disabledByConfig;
}

function getRouteFromPfs$(action: pathFind.request, deps: RaidenEpicDeps): Observable<Route> {
  return deps.config$.pipe(
    first(),
    mergeWith((config) => getPfsInfo$(action.payload.pfs, config.pfs, deps)),
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
  paths: Paths | undefined,
): Paths {
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
        const { tokenNetwork, target, value } = action.meta;
        const channelCanRoutePossible = channelCanRoute(
          state,
          presences,
          tokenNetwork,
          recipient,
          target,
          value,
        );
        shouldSelectPath = channelCanRoutePossible === true;
        reasonToNotSelect =
          typeof channelCanRoutePossible === 'string' ? channelCanRoutePossible : '';
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

function getPfsInfo$(
  pfsByAction: PFS | null | undefined,
  pfsByConfig: string | Address | null,
  deps: RaidenEpicDeps,
): Observable<PFS> {
  if (pfsByAction) return of(pfsByAction);
  else if (pfsByConfig) return pfsInfo(pfsByConfig, deps);
  else {
    const { log, latest$, init$ } = deps;
    return init$.pipe(
      lastMap(() => latest$.pipe(first(), pluck('state', 'services'))),
      map((services) => Object.keys(services) as Address[]),
      mergeMap((services) => pfsListInfo(services, deps)), // fetch pfsInfo from whole list & sort it
      tap((pfsInfos) => log.info('Auto-selecting best PFS from:', pfsInfos)),
      pluck(0), // pop best ranked
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
