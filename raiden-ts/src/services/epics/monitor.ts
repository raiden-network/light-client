import { BigNumber } from '@ethersproject/bignumber';
import { concat as concatBytes } from '@ethersproject/bytes';
import { MaxUint256, WeiPerEther, Zero } from '@ethersproject/constants';
import type { Observable } from 'rxjs';
import { AsyncSubject, combineLatest, EMPTY, from, of, timer } from 'rxjs';
import {
  debounce,
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  pairwise,
  pluck,
  switchMap,
  take,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { newBlock } from '../../channels/actions';
import type { Channel } from '../../channels/state';
import { channelAmounts, groupChannel } from '../../channels/utils';
import { messageServiceSend } from '../../messages/actions';
import type { MonitorRequest } from '../../messages/types';
import { MessageType } from '../../messages/types';
import { createBalanceHash, MessageTypeId, signMessage } from '../../messages/utils';
import type { RaidenState } from '../../state';
import { makeMessageId } from '../../transfers/utils';
import type { RaidenEpicDeps } from '../../types';
import { encode } from '../../utils/data';
import { fromEthersEvent, logToContractEvent } from '../../utils/ethers';
import { catchAndLog, completeWith } from '../../utils/rx';
import type { Address, Hash, Signature, UInt } from '../../utils/types';
import { isntNil } from '../../utils/types';
import { msBalanceProofSent } from '../actions';
import { Service } from '../types';

/**
 * Makes a *Map callback which returns an observable of actions to send RequestMonitoring messages
 *
 * @param state$ - Observable of RaidenStates
 * @param channel - Channel state to generate a a monitoring request for
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
function makeMonitoringRequest$(
  state$: Observable<RaidenState>,
  channel: Channel,
  { address, log, network, signer, contractsInfo, latest$, config$ }: RaidenEpicDeps,
) {
  const { partnerUnlocked } = channelAmounts(channel);
  // give up early if nothing to lose
  if (partnerUnlocked.isZero()) return EMPTY;

  return combineLatest([latest$, config$]).pipe(
    // combineLatest + filter ensures it'll pass if anything here changes
    filter(
      ([{ udcDeposit }, { monitoringReward, rateToSvt }]) =>
        // ignore actions while/if config.monitoringReward isn't enabled
        !!monitoringReward?.gt(Zero) &&
        // wait for udcDepost.balance >= monitoringReward, fires immediately if already
        udcDeposit.balance.gte(monitoringReward) &&
        // use partner's total off & on-chain unlocked, total we'd lose if don't update BP
        partnerUnlocked
          // use rateToSvt to convert to equivalent SVT, and pass only if > monitoringReward;
          // default rate=MaxUint256 means it'll ALWAYS monitor if no rate is set for token
          .mul(rateToSvt[channel.token] ?? MaxUint256)
          .div(WeiPerEther)
          .gt(monitoringReward),
    ),
    take(1), // take/act on first time all conditions above pass
    completeWith(state$, 10), // if conditions weren't met on shutdown, give up
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
        map((message) => messageServiceSend.request({ message }, { service: Service.MS, msgId })),
      );
    }),
    catchAndLog({ log: log.warn }, 'Error trying to generate & sign MonitorRequest'),
  );
}

/**
 * Handle balanceProof change from partner (received transfers) and request monitoring from MS
 *
 * @param action$ - Observable of channelDeposit.success actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @returns Observable of messageServiceSend.request actions
 */
export function msMonitorRequestEpic(
  {}: Observable<RaidenAction>,
  state$: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<messageServiceSend.request> {
  return state$.pipe(
    groupChannel(),
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
        // switchMap may unsubscribe from previous udcDeposit wait/signature prompts if partner's
        // balanceProof balance changes in the meantime
        switchMap(([, channel]) => makeMonitoringRequest$(state$, channel, deps)),
      ),
    ),
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
