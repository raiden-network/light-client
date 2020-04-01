import { OperatorFunction, from } from 'rxjs';
import { tap, mergeMap, map } from 'rxjs/operators';
import { Zero } from 'ethers/constants';
import { ContractTransaction } from 'ethers/contract';

import { RaidenEpicDeps } from '../types';
import { UInt, Hash } from '../utils/types';
import { ErrorCodes, RaidenError } from '../utils/error';
import { Channel, ChannelState } from './state';

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

  const ownWithdraw = channel.own.withdraw ?? Zero32,
    partnerWithdraw = channel.partner.withdraw ?? Zero32,
    ownTransferred = channel.own.balanceProof?.transferredAmount ?? Zero32,
    partnerTransferred = channel.partner.balanceProof?.transferredAmount ?? Zero32,
    ownLocked = channel.own.balanceProof?.lockedAmount ?? Zero32,
    partnerLocked = channel.partner.balanceProof?.lockedAmount ?? Zero32,
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
