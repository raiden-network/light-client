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
  mergeMap,
  pluck,
  repeatWhen,
  startWith,
  take,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { newBlock } from '../../channels/actions';
import { approveIfNeeded$, assertTx } from '../../channels/utils';
import { intervalFromConfig } from '../../config';
import type { HumanStandardToken, UserDeposit } from '../../contracts';
import { chooseOnchainAccount, getContractWithSigner } from '../../helpers';
import type { RaidenState } from '../../state';
import { dispatchAndWait$ } from '../../transfers/epics/utils';
import type { RaidenEpicDeps } from '../../types';
import { isConfirmationResponseOf } from '../../utils/actions';
import { assert, commonTxErrors, ErrorCodes, networkErrors } from '../../utils/error';
import { catchAndLog, mergeWith, retryAsync$, retryWhile, takeIf } from '../../utils/rx';
import type { Address, UInt } from '../../utils/types';
import { udcDeposit, udcWithdraw, udcWithdrawPlan } from '../actions';

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
  { log, provider, config$ }: Pick<RaidenEpicDeps, 'log' | 'provider' | 'config$'>,
) {
  return defer(async () =>
    Promise.all([
      tokenContract.callStatic.balanceOf(sender) as Promise<UInt<32>>,
      tokenContract.callStatic.allowance(sender, userDepositContract.address) as Promise<UInt<32>>,
    ]),
  ).pipe(
    retryWhile(intervalFromConfig(config$), { onErrors: networkErrors }),
    withLatestFrom(config$),
    mergeMap(([[balance, allowance], { minimumAllowance }]) =>
      approveIfNeeded$(
        [balance, allowance, deposit],
        tokenContract,
        userDepositContract.address as Address,
        ErrorCodes.RDN_APPROVE_TRANSACTION_FAILED,
        { provider },
        { log, minimumAllowance },
      ),
    ),
    mergeMap(() =>
      defer(async () => userDepositContract.callStatic.total_deposit(address)).pipe(
        retryWhile(intervalFromConfig(config$), { onErrors: networkErrors }),
        mergeMap(async (deposited) => {
          assert(deposited.add(deposit).eq(totalDeposit), [
            ErrorCodes.UDC_DEPOSIT_OUTDATED,
            { requested: totalDeposit.toString(), current: deposited.toString() },
          ]);
          // send setTotalDeposit transaction
          return userDepositContract.deposit(address, totalDeposit);
        }),
      ),
    ),
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
 * @param action$ - Observable of udcWithdrawPlan.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.userDepositContract - UDC contract instance
 * @param deps.address - Our address
 * @param deps.log - Logger instance
 * @param deps.signer - Signer instance
 * @param deps.provider - Provider instance
 * @param deps.config$ - Config observable
 * @returns Observable of udcWithdrawPlan.success|udcWithdrawPlan.failure actions
 */
export function udcWithdrawPlanRequestEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { userDepositContract, address, log, signer, provider, config$ }: RaidenEpicDeps,
): Observable<udcWithdrawPlan.success | udcWithdrawPlan.failure> {
  return action$.pipe(
    filter(udcWithdrawPlan.request.is),
    concatMap((action) => {
      const contract = getContractWithSigner(userDepositContract, signer);
      const amount = action.meta.amount;
      return retryAsync$(
        async () => userDepositContract.callStatic.balances(address),
        intervalFromConfig(config$),
        { onErrors: networkErrors, log: log.info },
      ).pipe(
        mergeMap(async (balance) => {
          assert(amount.gt(Zero), [
            ErrorCodes.UDC_PLAN_WITHDRAW_GT_ZERO,
            { amount: amount.toString() },
          ]);

          assert(amount.lte(balance), [
            ErrorCodes.UDC_PLAN_WITHDRAW_EXCEEDS_AVAILABLE,
            { balance: balance.toString(), amount: amount.toString() },
          ]);

          return contract.planWithdraw(amount);
        }),
        assertTx('planWithdraw', ErrorCodes.UDC_PLAN_WITHDRAW_FAILED, { log, provider }),
        retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.info }),
        mergeWith(() =>
          retryAsync$(
            async () => userDepositContract.callStatic.withdraw_plans(address),
            intervalFromConfig(config$),
            { onErrors: networkErrors },
          ).pipe(
            repeatWhen((comp$) =>
              comp$.pipe(mergeMap(() => action$.pipe(filter(newBlock.is), take(1)))),
            ),
            first(({ amount }) => amount.gte(action.meta.amount)),
          ),
        ),
        map(([[{ hash: txHash }, { blockNumber: txBlock }], { withdraw_block }]) =>
          udcWithdrawPlan.success(
            {
              block: withdraw_block.toNumber(),
              txHash,
              txBlock,
              confirmed: undefined,
            },
            action.meta,
          ),
        ),
        catchError((err) => of(udcWithdrawPlan.failure(err, action.meta))),
      );
    }),
  );
}

/**
 * If config.autoUdcWithdraw is enabled, monitors planned withdraws and udcWithdraw.request when
 * ready
 *
 * @param action$ - Observable of RaidenActions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.userDepositContract - UDC contract instance
 * @param deps.address - Our address
 * @param deps.config$ - Config observable
 * @param deps.log - Logger instance
 * @returns Observable of udcWithdrawPlan.success actions
 */
export function udcAutoWithdrawEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { userDepositContract, address, config$, log }: RaidenEpicDeps,
): Observable<udcWithdraw.request> {
  const WITHDRAW_TIMEOUT = 100;
  let nextCheckBlock = 0;
  return action$.pipe(
    filter(newBlock.is),
    filter((action) => action.payload.blockNumber >= nextCheckBlock),
    exhaustMap((action) =>
      defer(async () => userDepositContract.withdraw_plans(address)).pipe(
        catchAndLog({ onErrors: networkErrors, log: log.debug }),
        filter(({ withdraw_block: withdrawBlock }) => {
          const currentBlock = action.payload.blockNumber;
          if (withdrawBlock.isZero()) {
            nextCheckBlock = currentBlock + WITHDRAW_TIMEOUT;
            return false;
          } else if (withdrawBlock.gt(currentBlock)) {
            nextCheckBlock = withdrawBlock.toNumber();
            return false;
          }
          return true;
        }),
        mergeMap(({ amount }) => {
          const meta = { amount: amount as UInt<32> };
          return dispatchAndWait$(
            action$,
            udcWithdraw.request(undefined, meta),
            isConfirmationResponseOf(udcWithdraw, meta),
          );
        }),
      ),
    ),
    takeIf(config$.pipe(pluck('autoUdcWithdraw'))),
  );
}

/**
 * Handle a udcWithdraw.request and attempt to withdraw from UDC
 *
 * @param action$ - Observable of udcWithdraw.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.log - Logger instance
 * @param deps.userDepositContract - UDC contract instance
 * @param deps.address - Our address
 * @param deps.signer - Signer instance
 * @param deps.provider - Provider instance
 * @param deps.config$ - Config observable
 * @returns Observable of udcWithdraw.success|udcWithdraw.failure actions
 */
export function udcWithdrawEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { log, userDepositContract, address, signer, provider, config$ }: RaidenEpicDeps,
): Observable<udcWithdraw.success | udcWithdraw.failure> {
  return action$.pipe(
    filter(udcWithdraw.request.is),
    concatMap((action) => {
      const contract = getContractWithSigner(userDepositContract, signer);
      let balance: UInt<32>;
      return retryAsync$(
        async () => userDepositContract.callStatic.balances(address),
        intervalFromConfig(config$),
        { onErrors: networkErrors, log: log.info },
      ).pipe(
        mergeMap(async (balance_) => {
          assert(balance_.gt(Zero), [
            ErrorCodes.UDC_WITHDRAW_NO_BALANCE,
            { balance: balance_.toString() },
          ]);
          balance = balance_ as UInt<32>;
          return contract.withdraw(action.meta.amount);
        }),
        assertTx('withdraw', ErrorCodes.UDC_WITHDRAW_FAILED, { log, provider }),
        retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.debug }),
        mergeMap(([, { transactionHash, blockNumber }]) =>
          action$.pipe(
            filter(newBlock.is),
            exhaustMap(() =>
              defer(async () => contract.callStatic.balances(address)).pipe(
                catchAndLog({ onErrors: networkErrors, log: log.info }),
              ),
            ),
            filter((newBalance) => newBalance.lt(balance)),
            take(1),
            map((newBalance) =>
              udcWithdraw.success(
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
