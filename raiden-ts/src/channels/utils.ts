import { OperatorFunction, from, Observable } from 'rxjs';
import {
  tap,
  mergeMap,
  map,
  concatMap,
  scan,
  pluck,
  filter,
  groupBy,
  takeUntil,
} from 'rxjs/operators';
import { Zero } from 'ethers/constants';
import { ContractTransaction } from 'ethers/contract';

import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { UInt, Hash, Address, isntNil } from '../utils/types';
import { ErrorCodes, RaidenError } from '../utils/error';
import { pluckDistinct } from '../utils/rx';
import { Channel, ChannelState } from './state';
import { ChannelKey, ChannelUniqueKey } from './types';

/**
 * Returns a key (string) for a channel unique per tokenNetwork+partner
 *
 * @param channel - Either a Channel or a { tokenNetwork, partner } pair of addresses
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
      partnerDeposit: Zero32,
      partnerWithdraw: Zero32,
      partnerTransferred: Zero32,
      partnerLocked: Zero32,
      partnerBalance: Zero32,
      partnerCapacity: Zero32,
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
      .add(partnerBalance) as UInt<32>;

  return {
    ownDeposit: channel.own.deposit,
    ownWithdraw,
    ownTransferred,
    ownLocked,
    ownBalance,
    ownCapacity,
    partnerDeposit: channel.partner.deposit,
    partnerWithdraw,
    partnerTransferred,
    partnerLocked,
    partnerBalance,
    partnerCapacity,
  };
}

/**
 * Custom operator to wait & assert transaction success
 *
 * @param method - method name to use in logs
 * @param error - ErrorCode to throw if transaction fails
 * @param deps - object containing logger
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
    pluckDistinct('channels'),
    concatMap((channels) => from(Object.entries(channels))),
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
              changed: channel,
            },
      { acc: {} } as { acc: RaidenState['channels']; changed?: Channel },
    ),
    pluck('changed'),
    filter(isntNil), // filter out if reference didn't change from last emit
    groupBy(channelUniqueKey),
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
