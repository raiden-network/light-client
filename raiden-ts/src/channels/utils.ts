import { Zero } from '@ethersproject/constants';
import type { ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import type { Observable, OperatorFunction } from 'rxjs';
import { defer, of, ReplaySubject } from 'rxjs';
import {
  filter,
  groupBy,
  map,
  mapTo,
  mergeMap,
  pluck,
  takeUntil,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import type { HumanStandardToken } from '../contracts';
import { MessageType } from '../messages/types';
import type { RaidenState } from '../state';
import type { RaidenEpicDeps } from '../types';
import { assert, ErrorCodes, networkErrors, RaidenError } from '../utils/error';
import { distinctRecordValues, retryAsync$ } from '../utils/rx';
import type { Address, Hash, Int, UInt } from '../utils/types';
import { bnMax } from '../utils/types';
import type { Channel, ChannelBalances } from './state';
import type { ChannelKey, ChannelUniqueKey } from './types';

/**
 * Returns a key (string) for a channel unique per tokenNetwork+partner
 *
 * @param channel - Either a Channel or a { tokenNetwork, partner } pair of addresses
 * @param channel.tokenNetwork - TokenNetwork address
 * @param channel.partner - Partner address
 * @returns A string, for now
 */
export function channelKey({
  tokenNetwork,
  partner,
}: { tokenNetwork: Address } & (
  | { partner: { address: Address } }
  | { partner: Address }
)): ChannelKey {
  const partnerAddr =
    typeof partner === 'string' ? partner : (partner as { address: Address }).address;
  return `${tokenNetwork}@${partnerAddr}` as ChannelKey;
}

/**
 * Returns a unique key (string) for a channel per tokenNetwork+partner+id
 *
 * @param channel - Either a Channel or a { tokenNetwork, partner } pair of addresses
 * @returns A string, for now
 */
export function channelUniqueKey<
  C extends { _id?: ChannelUniqueKey; id: number; tokenNetwork: Address } & (
    | { partner: { address: Address } }
    | { partner: Address }
  ),
>(channel: C): ChannelUniqueKey {
  if ('_id' in channel && channel._id) return channel._id;
  return `${channelKey(channel)}#${channel.id.toString().padStart(9, '0')}` as ChannelUniqueKey;
}

/**
 * Calculates and returns partial and total amounts of given channel state
 *
 * @param channel - A Channel state to calculate amounts from
 * @returns An object holding own&partner's deposit, withdraw, transferred, locked, balance and
 *          capacity.
 */
export function channelAmounts(channel: Channel): ChannelBalances {
  const ownWithdraw = channel.own.withdraw,
    partnerWithdraw = channel.partner.withdraw,
    ownTransferred = channel.own.balanceProof.transferredAmount,
    partnerTransferred = channel.partner.balanceProof.transferredAmount,
    ownOnchainUnlocked = channel.own.locks
      .filter((lock) => lock.registered)
      .reduce((acc, lock) => acc.add(lock.amount), Zero) as UInt<32>,
    partnerOnchainUnlocked = channel.partner.locks
      .filter((lock) => lock.registered)
      .reduce((acc, lock) => acc.add(lock.amount), Zero) as UInt<32>,
    ownUnlocked = ownTransferred.add(ownOnchainUnlocked) as UInt<32>,
    partnerUnlocked = partnerTransferred.add(partnerOnchainUnlocked) as UInt<32>,
    ownLocked = channel.own.balanceProof.lockedAmount.sub(ownOnchainUnlocked) as UInt<32>,
    partnerLocked = channel.partner.balanceProof.lockedAmount.sub(
      partnerOnchainUnlocked,
    ) as UInt<32>,
    ownBalance = partnerUnlocked.sub(ownUnlocked) as Int<32>,
    partnerBalance = ownUnlocked.sub(partnerUnlocked) as Int<32>, // == -ownBalance
    _ownPendingWithdraw = bnMax(
      // get maximum between actual and pending withdraws (as it's a total)
      ownWithdraw,
      ...channel.own.pendingWithdraws
        .filter((req) => req.type === MessageType.WITHDRAW_REQUEST)
        .map((req) => req.total_withdraw),
    ),
    _partnerPendingWithdraw = bnMax(
      partnerWithdraw,
      ...channel.partner.pendingWithdraws
        .filter((req) => req.type === MessageType.WITHDRAW_REQUEST)
        .map((req) => req.total_withdraw),
    ),
    ownCapacity = channel.own.deposit
      .sub(_ownPendingWithdraw) // pending withdraws reduce capacity
      .sub(ownLocked)
      .add(ownBalance) as UInt<32>,
    partnerCapacity = channel.partner.deposit
      .sub(_partnerPendingWithdraw)
      .sub(partnerLocked)
      .add(partnerBalance) as UInt<32>,
    ownTotalWithdrawable = channel.own.deposit.add(ownBalance).sub(ownLocked) as UInt<32>,
    ownWithdrawable = ownTotalWithdrawable.sub(ownWithdraw) as UInt<32>,
    partnerTotalWithdrawable = channel.partner.deposit
      .add(partnerBalance)
      .sub(partnerLocked) as UInt<32>,
    partnerWithdrawable = partnerTotalWithdrawable.sub(partnerWithdraw) as UInt<32>,
    totalCapacity = channel.own.deposit
      .sub(channel.own.withdraw)
      .add(channel.partner.deposit)
      .sub(channel.partner.withdraw) as UInt<32>;

  return {
    ownDeposit: channel.own.deposit,
    ownWithdraw,
    ownTransferred,
    ownLocked,
    ownBalance,
    ownCapacity,
    ownOnchainUnlocked,
    ownUnlocked,
    partnerDeposit: channel.partner.deposit,
    partnerWithdraw,
    partnerTransferred,
    partnerLocked,
    partnerBalance,
    partnerCapacity,
    partnerOnchainUnlocked,
    partnerUnlocked,
    ownTotalWithdrawable,
    ownWithdrawable,
    partnerTotalWithdrawable,
    partnerWithdrawable,
    totalCapacity,
  };
}

/**
 * Custom operator to wait & assert transaction success
 *
 * @param method - method name to use in logs
 * @param error - ErrorCode to throw if transaction fails
 * @param deps - object containing logger
 * @param deps.log - Logger instance
 * @param deps.provider - Eth provider
 * @returns operator function to wait for transaction and output hash
 */
export function assertTx(
  method: string,
  error: string,
  { log, provider }: Pick<RaidenEpicDeps, 'log' | 'provider'>,
): OperatorFunction<
  ContractTransaction,
  [
    ContractTransaction & { hash: Hash },
    ContractReceipt & { transactionHash: Hash; blockNumber: number },
  ]
> {
  return (tx$) =>
    tx$.pipe(
      tap((tx) => log.debug(`sent ${method} tx "${tx.hash}" to "${tx.to}"`)),
      mergeMap((tx) =>
        retryAsync$(() => tx.wait(), provider.pollingInterval, { onErrors: networkErrors }).pipe(
          map((txReceipt) => [tx, txReceipt] as const),
        ),
      ),
      map(([tx, receipt]) => {
        if (!receipt.status || !receipt.transactionHash || !receipt.blockNumber)
          throw new RaidenError(error, {
            status: receipt.status ?? null,
            transactionHash: receipt.transactionHash ?? null,
            blockNumber: receipt.blockNumber ?? null,
          });
        log.debug(`${method} tx "${receipt.transactionHash}" successfuly mined!`);
        return [tx, receipt] as [
          ContractTransaction & { hash: Hash },
          ContractReceipt & { transactionHash: Hash; blockNumber: number },
        ];
      }),
    );
}

/**
 * Reactively on state, emits grouped observables per channel which emits respective channel
 * states and completes when channel is settled.
 * Can be used either passing input directly or as an operator
 *
 * @returns Tuple containing grouped Observable and { key, id }: { ChannelKey, number } values
 */
export function groupChannel(): OperatorFunction<RaidenState, Observable<Channel>> {
  return (state$) =>
    state$.pipe(
      pluck('channels'),
      distinctRecordValues(),
      pluck(1),
      // grouped$ output will be backed by a ReplaySubject(1), so will emit latest channel state
      // immediately if resubscribed or withLatestFrom'd
      groupBy(channelUniqueKey, { connector: () => new ReplaySubject<Channel>(1) }),
      map((grouped$) => {
        const [key, _id] = grouped$.key.split('#') as [ChannelKey, `${number}`];
        const id = +_id;
        return grouped$.pipe(
          takeUntil(
            state$.pipe(
              // takeUntil first time state's channelId differs from this observable's
              // e.g. when channel is settled and gone (channel.id will be undefined)
              filter(({ channels }) => channels[key]?.id !== id),
            ),
          ),
        );
      }),
    );
}

/**
 * Approves spender to transfer up to 'deposit' from our tokens; skips if already allowed
 * Errors if sender doesn't have enough balance, or transaction fails (may be retried)
 *
 * @param tokenContract - Token contract instance already connected to sender's signer
 * @param spender - Spender address
 * @param amount - Amount to be required to be approved
 * @param deps - Epics dependencies
 * @param deps.log - Logger instance
 * @param deps.config$ - Config observable
 * @param deps.latest$ - Latest observable
 * @returns Observable of true (if already approved) or approval receipt
 */
export function ensureApprovedBalance$(
  tokenContract: HumanStandardToken,
  spender: Address,
  amount: UInt<32>,
  { log, config$, latest$ }: Pick<RaidenEpicDeps, 'log' | 'config$' | 'latest$'>,
): Observable<true | ContractReceipt> {
  const provider = tokenContract.provider as RaidenEpicDeps['provider'];
  return defer(async () => tokenContract.signer.getAddress() as Promise<Address>).pipe(
    mergeMap(async (sender) =>
      Promise.all([
        tokenContract.callStatic.balanceOf(sender) as Promise<UInt<32>>,
        tokenContract.callStatic.allowance(sender, spender) as Promise<UInt<32>>,
      ]),
    ),
    withLatestFrom(config$, latest$),
    mergeMap(([[balance, allowance], { minimumAllowance }, { gasPrice }]) => {
      assert(balance.gte(amount), [
        ErrorCodes.RDN_INSUFFICIENT_BALANCE,
        { current: balance, required: amount },
      ]);

      if (allowance.gte(amount)) return of(true as const); // if allowance already enough

      // secure ERC20 tokens require changing allowance only from or to Zero
      // see https://github.com/raiden-network/light-client/issues/2010
      let resetAllowance$: Observable<true> = of(true);
      if (!allowance.isZero())
        resetAllowance$ = defer(async () => tokenContract.approve(spender, 0, { gasPrice })).pipe(
          assertTx('approve', ErrorCodes.RDN_APPROVE_TRANSACTION_FAILED, { log, provider }),
          mapTo(true),
        );

      // if needed, send approveTx and wait/assert it before proceeding; 'amount' could be enough,
      // but we send 'prevAllowance + amount' in case there's a pending amount
      // default minimumAllowance=MaxUint256 allows to approve once and for all
      return resetAllowance$.pipe(
        mergeMap(async () =>
          tokenContract.approve(spender, bnMax(minimumAllowance, amount), { gasPrice }),
        ),
        assertTx('approve', ErrorCodes.RDN_APPROVE_TRANSACTION_FAILED, { log, provider }),
        pluck(1),
      );
    }),
  );
}
