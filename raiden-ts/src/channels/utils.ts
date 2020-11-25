import {
  OperatorFunction,
  Observable,
  ReplaySubject,
  throwError,
  timer,
  MonoTypeOperatorFunction,
  of,
  defer,
} from 'rxjs';
import {
  tap,
  mergeMap,
  map,
  pluck,
  filter,
  groupBy,
  takeUntil,
  retryWhen,
  mapTo,
} from 'rxjs/operators';
import { Zero } from '@ethersproject/constants';
import type { ContractTransaction, ContractReceipt } from '@ethersproject/contracts';
import logging, { Logger } from 'loglevel';

import type { HumanStandardToken } from '../contracts';
import { RaidenState } from '../state';
import { RaidenEpicDeps } from '../types';
import { UInt, Address, Hash, Int, bnMax } from '../utils/types';
import {
  RaidenError,
  assert,
  ErrorCodes,
  networkErrorRetryPredicate,
  networkErrors,
} from '../utils/error';
import { distinctRecordValues, retryAsync$ } from '../utils/rx';
import { MessageType } from '../messages/types';
import { Channel, ChannelBalances } from './state';
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
  const partnerAddr =
    typeof partner === 'string' ? partner : (partner as { address: Address }).address;
  return `${tokenNetwork}@${partnerAddr}`;
}

/**
 * Returns a unique key (string) for a channel per tokenNetwork+partner+id
 *
 * @param channel - Either a Channel or a { tokenNetwork, partner } pair of addresses
 * @returns A string, for now
 */
export function channelUniqueKey<
  C extends { _id?: string; id: number; tokenNetwork: Address } & (
    | { partner: { address: Address } }
    | { partner: Address }
  )
>(channel: C): ChannelUniqueKey {
  if ('_id' in channel && channel._id) return channel._id;
  return `${channelKey(channel)}#${channel.id.toString().padStart(9, '0')}`;
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
    partnerWithdrawable = partnerTotalWithdrawable.sub(partnerWithdraw) as UInt<32>;

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
  [ContractTransaction, ContractReceipt & { transactionHash: Hash; blockNumber: number }]
> {
  return (tx$) =>
    tx$.pipe(
      tap((tx) => log.debug(`sent ${method} tx "${tx.hash}" to "${tx.to}"`)),
      mergeMap((tx) =>
        retryAsync$(() => tx.wait(), provider.pollingInterval, networkErrorRetryPredicate).pipe(
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
          ContractTransaction,
          ContractReceipt & { transactionHash: Hash; blockNumber: number },
        ];
      }),
    );
}

export const txNonceErrors: readonly string[] = [
  'replacement fee too low',
  'gas price supplied is too low',
  'nonce is too low',
  'nonce has already been used',
  'already known',
  'Transaction with the same hash was already imported',
];
export const txFailErrors: readonly string[] = [
  'always failing transaction',
  'execution failed due to an exception',
  'transaction failed',
  'execution reverted',
  'cannot estimate gas',
];

/**
 * RxJS pipeable operator to re-subscribe/retry a transaction observable on recoverable errors
 *
 * For this to work, the input$ transaction observable must be re-subscribable:
 * e.g. a promise wrapped in a `defer` callback.
 *
 * @param interval - interval between retries
 * @param count - Maximum number of retries
 * @param errors - Retry if error.message includes some string in this array (recoverable errors)
 * @param options - Options object
 * @param options.log - Logger instance
 * @returns Monotype operator to re-subscribe to input observable
 */
export function retryTx<T>(
  interval = 1000,
  count = 10,
  errors: readonly string[] = txNonceErrors,
  { log }: { log: logging.Logger } = { log: logging },
): MonoTypeOperatorFunction<T> {
  // retry on network erros as well
  const allErrors = errors.concat(networkErrors);
  return (input$) =>
    input$.pipe(
      retryWhen((err$) =>
        err$.pipe(
          mergeMap((err, i) => {
            log.debug(`__retryTx ${i + 1}/${count} every ${interval}, error: `, err);
            if (i < count && allErrors.some((error) => err.message?.includes(error)))
              return timer(interval);
            return throwError(err);
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
      const [key, _id] = grouped$.key.split('#');
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

/* eslint-disable jsdoc/valid-types */
/**
 * Approves spender to transfer up to 'deposit' from our tokens; skips if already allowed
 *
 * @param amounts - Tuple of amounts
 * @param amounts.0 - Our current token balance
 * @param amounts.1 - Spender's current allowance
 * @param amounts.2 - The new desired allowance for spender
 * @param tokenContract - Token contract instance
 * @param spender - Spender address
 * @param approveError - ErrorCode of approve transaction errors
 * @param deps - Partial epics dependencies-like object
 * @param deps.provider - Eth provider
 * @param opts - Options object
 * @param opts.log - Logger instance for asserTx
 * @param opts.minimumAllowance - Minimum allowance to approve
 * @returns Cold observable to perform approve transactions
 */
export function approveIfNeeded$(
  [balance, allowance, deposit]: [UInt<32>, UInt<32>, UInt<32>],
  tokenContract: HumanStandardToken,
  spender: Address,
  approveError: string = ErrorCodes.RDN_APPROVE_TRANSACTION_FAILED,
  { provider }: Pick<RaidenEpicDeps, 'provider'>,
  { log, minimumAllowance }: { log: Logger; minimumAllowance: UInt<32> } = {
    log: logging,
    minimumAllowance: Zero as UInt<32>,
  },
): Observable<true | ContractReceipt> {
  assert(balance.gte(deposit), [
    ErrorCodes.RDN_INSUFFICIENT_BALANCE,
    { current: balance.toString(), required: deposit.toString() },
  ]);

  if (allowance.gte(deposit)) return of(true); // if allowance already enough

  // secure ERC20 tokens require changing allowance only from or to Zero
  // see https://github.com/raiden-network/light-client/issues/2010
  let resetAllowance$: Observable<true> = of(true);
  if (!allowance.isZero())
    resetAllowance$ = defer(async () => tokenContract.approve(spender, 0)).pipe(
      assertTx('approve', approveError, { log, provider }),
      mapTo(true),
    );

  // if needed, send approveTx and wait/assert it before proceeding; 'deposit' could be enough,
  // but we send 'prevAllowance + deposit' in case there's a pending deposit
  // default minimumAllowance=MaxUint256 allows to approve once and for all
  return resetAllowance$.pipe(
    mergeMap(async () => tokenContract.approve(spender, bnMax(minimumAllowance, deposit))),
    assertTx('approve', approveError, { log, provider }),
    pluck(1),
  );
}
/* eslint-enable jsdoc/valid-types */
