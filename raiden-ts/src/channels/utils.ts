import { OperatorFunction, from, Observable, ReplaySubject } from 'rxjs';
import { tap, mergeMap, map, pluck, filter, groupBy, takeUntil } from 'rxjs/operators';
import { Zero } from 'ethers/constants';
import { ContractTransaction } from 'ethers/contract';

import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { UInt, Hash, Address } from '../utils/types';
import { ErrorCodes, RaidenError } from '../utils/error';
import { distinctRecordValues } from '../utils/rx';
import { Channel, ChannelState } from './state';
import { ChannelKey, ChannelUniqueKey } from './types';

/**
 * Returns a key (string) for a channel unique per tokenNetwork+partner
 *
 * @param channel - Either a Channel or a { tokenNetwork, partner } pair of addresses
 * @param channel.tokenNetwork - TokenNetwork address
 * @param channel.partner - Partner address
 * @returns A string, for now
 */
export function channelKey<
  C extends { tokenNetwork: Address } & ({ partner: { address: Address } } | { partner: Address })
>({ tokenNetwork, partner }: C): ChannelKey {
  return `${
    typeof partner === 'string' ? partner : (partner as { address: Address }).address
  }@${tokenNetwork}`;
}

/**
 * Returns a unique key (string) for a channel per tokenNetwork+partner+id
 *
 * @param channel - Either a Channel or a { tokenNetwork, partner } pair of addresses
 * @returns A string, for now
 */
export function channelUniqueKey<
  C extends { id: number; tokenNetwork: Address } & (
    | { partner: { address: Address } }
    | { partner: Address }
  )
>(channel: C): ChannelUniqueKey {
  return `${channel.id}#${channelKey(channel)}`;
}

/**
 * Calculates and returns partial and total amounts of given channel state
 *
 * @param channel - A Channel state to calculate amounts from
 * @returns An object holding own&partner's deposit, withdraw, transferred, locked, balance and
 *          capacity.
 */
export function channelAmounts(channel: Channel) {
  const Zero32 = Zero as UInt<32>;
  if (channel.state !== ChannelState.open)
    return {
      ownDeposit: Zero32,
      ownWithdraw: Zero32,
      ownTransferred: Zero32,
      ownLocked: Zero32,
      ownBalance: Zero32,
      ownCapacity: Zero32,
      ownOnchainUnlocked: Zero32,
      ownUnlocked: Zero32, // total of off & onchain unlocked
      partnerDeposit: Zero32,
      partnerWithdraw: Zero32,
      partnerTransferred: Zero32,
      partnerLocked: Zero32,
      partnerBalance: Zero32,
      partnerCapacity: Zero32,
      partnerOnchainUnlocked: Zero32,
      partnerUnlocked: Zero32, // total of off & onchain unlocked
    };

  const ownWithdraw = channel.own.withdraw,
    partnerWithdraw = channel.partner.withdraw,
    ownTransferred = channel.own.balanceProof.transferredAmount,
    partnerTransferred = channel.partner.balanceProof.transferredAmount,
    ownLocked = channel.own.balanceProof.lockedAmount,
    partnerLocked = channel.partner.balanceProof.lockedAmount,
    ownBalance = partnerTransferred.sub(ownTransferred) as UInt<32>,
    partnerBalance = ownTransferred.sub(partnerTransferred) as UInt<32>, // == -ownBalance
    ownCapacity = channel.own.deposit.sub(ownWithdraw).sub(ownLocked).add(ownBalance) as UInt<32>,
    partnerCapacity = channel.partner.deposit
      .sub(partnerWithdraw)
      .sub(partnerLocked)
      .add(partnerBalance) as UInt<32>,
    ownOnchainUnlocked = channel.own.locks
      .filter((lock) => lock.registered)
      .reduce((acc, lock) => acc.add(lock.amount), Zero) as UInt<32>,
    partnerOnchainUnlocked = channel.partner.locks
      .filter((lock) => lock.registered)
      .reduce((acc, lock) => acc.add(lock.amount), Zero) as UInt<32>,
    ownUnlocked = ownTransferred.add(ownOnchainUnlocked) as UInt<32>,
    partnerUnlocked = partnerTransferred.add(partnerOnchainUnlocked) as UInt<32>;

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
  };
}

/**
 * Custom operator to wait & assert transaction success
 *
 * @param method - method name to use in logs
 * @param error - ErrorCode to throw if transaction fails
 * @param deps - object containing logger
 * @param deps.log - Logger instance
 * @returns operator function to wait for transaction and output hash
 */
export function assertTx(
  method: string,
  error: ErrorCodes,
  { log }: Pick<RaidenEpicDeps, 'log'>,
): OperatorFunction<ContractTransaction, Hash> {
  /**
   * Operator to check for tx
   *
   * @param tx - pending contract tx
   * @returns Observable of txHash
   */
  return (tx) =>
    tx.pipe(
      tap((tx) => log.debug(`sent ${method} tx "${tx.hash}" to "${tx.to}"`)),
      mergeMap((tx) =>
        from(tx.wait()).pipe(
          map((receipt) => {
            if (!receipt.status) throw new RaidenError(error, { transactionHash: tx.hash! });
            log.debug(`${method} tx "${tx.hash}" successfuly mined!`);
            return tx.hash as Hash;
          }),
        ),
      ),
    );
}

/**
 * Reactively on state, emits grouped observables per channel which emits respective channel
 * states and completes when channel is settled.
 * Can be used either passing input directly or as an operator
 *
 * @param state$ - RaidenState observable, use Latest['state'] for emit at subscription
 * @returns Tuple containing grouped Observable and { key, id }: { ChannelKey, number } values
 */
export function groupChannel$(state$: Observable<RaidenState>) {
  return state$.pipe(
    pluck('channels'),
    distinctRecordValues(),
    pluck(1),
    // grouped$ output will be backed by a ReplaySubject(1), so will emit latest channel state
    // immediately if resubscribed or withLatestFrom'd
    groupBy(channelUniqueKey, undefined, undefined, () => new ReplaySubject<Channel>(1)),
    map((grouped$) => {
      const [_id, key] = grouped$.key.split('#');
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
