import { Zero } from '@ethersproject/constants';
import constant from 'lodash/constant';
import type { Observable } from 'rxjs';
import { defer, EMPTY, of } from 'rxjs';
import {
  catchError,
  concatMap,
  exhaustMap,
  filter,
  first,
  map,
  mapTo,
  mergeMap,
  pluck,
  startWith,
  take,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { newBlock } from '../../channels/actions';
import { approveIfNeeded$, assertTx } from '../../channels/utils';
import type { RaidenConfig } from '../../config';
import { intervalFromConfig } from '../../config';
import type { HumanStandardToken, UserDeposit } from '../../contracts';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import type { RaidenState } from '../../state';
import type { RaidenEpicDeps } from '../../types';
import { assert, commonTxErrors, ErrorCodes, networkErrors } from '../../utils/error';
import { pluckDistinct, retryAsync$, retryWhile } from '../../utils/rx';
import type { Address, UInt } from '../../utils/types';
import { udcDeposit, udcWithdraw, udcWithdrawn } from '../actions';

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
        catchError((err) => of(udcWithdraw.failure(err, action.meta))),
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
        catchError((err) => of(udcWithdraw.failure(err, action.meta))),
      );
    }),
  );
}
