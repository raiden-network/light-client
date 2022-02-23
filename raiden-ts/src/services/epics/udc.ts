import { Zero } from '@ethersproject/constants';
import constant from 'lodash/constant';
import type { Observable } from 'rxjs';
import { combineLatest, defer, EMPTY, forkJoin, of } from 'rxjs';
import {
  catchError,
  concatMap,
  exhaustMap,
  filter,
  first,
  map,
  mergeAll,
  mergeMap,
  pluck,
  shareReplay,
  startWith,
  take,
  withLatestFrom,
} from 'rxjs/operators';

import type { RaidenAction } from '../../actions';
import { newBlock } from '../../channels/actions';
import { ensureApprovedBalance$, transact } from '../../channels/utils';
import { intervalFromConfig } from '../../config';
import type { HumanStandardToken, UserDeposit } from '../../contracts';
import { getContractWithSigner } from '../../helpers';
import type { RaidenState } from '../../state';
import { dispatchAndWait$ } from '../../transfers/epics/utils';
import type { RaidenEpicDeps } from '../../types';
import { isConfirmationResponseOf } from '../../utils/actions';
import { assert, commonTxErrors, ErrorCodes, networkErrors } from '../../utils/error';
import { checkContractHasMethod$ } from '../../utils/ethers';
import { catchAndLog, completeWith, retryWhile, takeIf, withMergeFrom } from '../../utils/rx';
import type { Address, UInt } from '../../utils/types';
import { udcDeposit, udcWithdraw, udcWithdrawPlan } from '../actions';

/**
 * Monitors the balance of UDC and emits udcDeposited, made available in Latest['udcDeposit']
 *
 * @param action$ - Observable of newBlock actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @param deps.address - Our address
 * @param deps.latest$ - Latest observable
 * @param deps.userDepositContract - UserDeposit contract instance
 * @param deps.config$ - Config observable
 * @returns Observable of udcDeposited actions
 */
export function monitorUdcBalanceEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  { address, latest$, config$, userDepositContract }: RaidenEpicDeps,
): Observable<udcDeposit.success> {
  return action$.pipe(
    filter(newBlock.is),
    pluck('payload', 'blockNumber'),
    withLatestFrom(config$),
    // it's seems ugly to call on each block, but UserDepositContract doesn't expose deposits as
    // events, and ethers actually do that to monitor token balances, so it's equivalent
    exhaustMap(([blockNumber, { confirmationBlocks }]) =>
      /* This contract's function is pure (doesn't depend on user's confirmation, gas availability,
       * etc), but merged on the top-level observable, therefore connectivity issues can cause
       * exceptions which would shutdown the SDK. Let's swallow the error here, since this will be
       * retried on next block, which should only be emitted after connectivity is reestablished */
      defer(async () =>
        Promise.all([
          userDepositContract.callStatic.effectiveBalance(address, {
            blockTag: blockNumber - confirmationBlocks,
          }) as Promise<UInt<32>>,
          userDepositContract.callStatic.total_deposit(address, {
            blockTag: blockNumber - confirmationBlocks,
          }) as Promise<UInt<32>>,
        ]),
      ).pipe(catchError(constant(EMPTY))),
    ),
    withLatestFrom(latest$),
    filter(([[balance], { udcDeposit }]) => !udcDeposit.balance.eq(balance)),
    map(([[balance, totalDeposit]]) => udcDeposit.success({ balance }, { totalDeposit })),
  );
}

function makeUdcDeposit$(
  [tokenContract, userDepositContract]: [HumanStandardToken, UserDeposit],
  [deposit, totalDeposit]: [UInt<32>, UInt<32>],
  deps: RaidenEpicDeps,
) {
  const { address, log, config$, latest$ } = deps;
  let finalBalance: UInt<32>;

  return ensureApprovedBalance$(
    tokenContract,
    userDepositContract.address as Address,
    deposit,
    deps,
  ).pipe(
    withLatestFrom(latest$),
    mergeMap(([, { udcDeposit: prev }]) => {
      assert(prev.totalDeposit.add(deposit).eq(totalDeposit), [
        ErrorCodes.UDC_DEPOSIT_OUTDATED,
        { requested: totalDeposit, current: prev.totalDeposit },
      ]);
      finalBalance = prev.balance.add(deposit) as UInt<32>;
      // send setTotalDeposit transaction
      return transact(userDepositContract, 'deposit', [address, totalDeposit], deps, {
        error: ErrorCodes.RDN_DEPOSIT_TRANSACTION_FAILED,
      });
    }),
    // retry also txFail errors, since estimateGas can lag behind just-opened channel or
    // just-approved allowance
    retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.debug }),
    map(([, receipt]) =>
      udcDeposit.success(
        {
          balance: finalBalance,
          txHash: receipt.transactionHash,
          txBlock: receipt.blockNumber,
          confirmed: undefined, // let confirmationEpic confirm this action
        },
        { totalDeposit },
      ),
    ),
  );
}

/**
 * Handles a udcDeposit.request and deposit SVT/RDN to UDC
 *
 * @param action$ - Observable of udcDeposit.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @returns - Observable of udcDeposit.failure|udcDeposit.success actions
 */
export function udcDepositEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<udcDeposit.failure | udcDeposit.success> {
  const { userDepositContract, getTokenContract, config$, log } = deps;
  return action$.pipe(
    filter(udcDeposit.request.is),
    concatMap((action) =>
      defer(async () => userDepositContract.callStatic.token() as Promise<Address>).pipe(
        retryWhile(intervalFromConfig(config$), { onErrors: networkErrors, log: log.debug }),
        mergeMap((token) =>
          makeUdcDeposit$(
            [getTokenContract(token), userDepositContract],
            [action.payload.deposit, action.meta.totalDeposit],
            deps,
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
 * @returns Observable of udcWithdrawPlan.success|udcWithdrawPlan.failure actions
 */
export function udcWithdrawPlanRequestEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<udcWithdrawPlan.success | udcWithdrawPlan.failure> {
  const { userDepositContract, address, log, signer, config$ } = deps;
  return action$.pipe(
    filter(udcWithdrawPlan.request.is),
    concatMap((action) => {
      const contract = getContractWithSigner(userDepositContract, signer);
      const amount = action.meta.amount;
      return defer(async () => userDepositContract.callStatic.balances(address)).pipe(
        mergeMap((balance) => {
          assert(amount.gt(Zero), [
            ErrorCodes.UDC_PLAN_WITHDRAW_GT_ZERO,
            { amount: amount.toString() },
          ]);

          assert(amount.lte(balance), [
            ErrorCodes.UDC_PLAN_WITHDRAW_EXCEEDS_AVAILABLE,
            { balance: balance.toString(), amount: amount.toString() },
          ]);

          return transact(contract, 'planWithdraw', [amount], deps, {
            subkey: true,
            error: ErrorCodes.UDC_PLAN_WITHDRAW_FAILED,
          });
        }),
        retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.info }),
        withMergeFrom(() =>
          action$.pipe(
            filter(newBlock.is),
            startWith(0),
            exhaustMap(() =>
              defer(async () => userDepositContract.callStatic.withdraw_plans(address)).pipe(
                catchAndLog({ onErrors: networkErrors, log: log.debug }),
              ),
            ),
            first(({ amount }) => amount.gte(action.meta.amount)),
          ),
        ),
        map(([[{ hash: txHash }, { blockNumber: txBlock }], { withdrawable_after }]) =>
          udcWithdrawPlan.success(
            {
              withdrawableAfter: withdrawable_after.toNumber(),
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
 * If config.autoUDCWithdraw is enabled, monitors planned withdraws and udcWithdraw.request when
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
): Observable<udcWithdraw.request | udcWithdrawPlan.success> {
  let nextCheckAfter = 0; // milliseconds
  const udcWithdrawTimeout$ = defer(async () =>
    (await userDepositContract.callStatic.withdraw_timeout()).toNumber(),
  ).pipe(retryWhile(intervalFromConfig(config$)), shareReplay({ bufferSize: 1, refCount: false }));
  return action$.pipe(
    filter(newBlock.is),
    filter(() => Date.now() >= nextCheckAfter),
    exhaustMap(() =>
      combineLatest([
        defer(async () => userDepositContract.callStatic.withdraw_plans(address)),
        udcWithdrawTimeout$,
      ]).pipe(
        mergeMap(function* ([
          { amount, withdrawable_after: withdrawableAfter },
          udcWithdrawTimeout,
        ]) {
          const meta = { amount: amount as UInt<32> };
          if (withdrawableAfter.isZero()) {
            nextCheckAfter = Date.now() + udcWithdrawTimeout * 1e3;
            return; // no plan, don't proceed to startupCheck
          }
          const startupCheck = nextCheckAfter === 0;
          if (startupCheck) {
            yield of(
              udcWithdrawPlan.success(
                { withdrawableAfter: withdrawableAfter.toNumber(), confirmed: true },
                meta,
              ),
            );
          }
          if (withdrawableAfter.gt(Math.round(Date.now() / 1e3))) {
            nextCheckAfter = withdrawableAfter.toNumber() * 1e3;
          } else {
            yield dispatchAndWait$(
              action$,
              udcWithdraw.request(undefined, meta),
              isConfirmationResponseOf(udcWithdraw, meta),
            );
          }
        }),
        mergeAll(), // mergeMap above yields observables, so merge them inside exhaustMap
        catchAndLog({ log: log.info }),
      ),
    ),
    takeIf(config$.pipe(pluck('autoUDCWithdraw'), completeWith(action$))),
  );
}

/**
 * Handle a udcWithdraw.request and attempt to withdraw from UDC
 *
 * @param action$ - Observable of udcWithdraw.request actions
 * @param state$ - Observable of RaidenStates
 * @param deps - Epics dependencies
 * @returns Observable of udcWithdraw.success|udcWithdraw.failure actions
 */
export function udcWithdrawEpic(
  action$: Observable<RaidenAction>,
  {}: Observable<RaidenState>,
  deps: RaidenEpicDeps,
): Observable<udcWithdraw.success | udcWithdraw.failure> {
  const { log, userDepositContract, address, config$, main } = deps;
  return action$.pipe(
    filter(udcWithdraw.request.is),
    concatMap((action) => {
      let balance: UInt<32>;
      let toAccount: Address;
      return forkJoin([
        defer(async () => userDepositContract.callStatic.balances(address)),
        checkContractHasMethod$(userDepositContract, 'withdrawToBeneficiary').pipe(
          catchError(constant(of(false))),
        ),
      ]).pipe(
        withLatestFrom(config$),
        mergeMap(([[balance_, hasMethod], { subkey }]) => {
          assert(balance_.gt(Zero), [
            ErrorCodes.UDC_WITHDRAW_NO_BALANCE,
            { balance: balance_.toString() },
          ]);
          balance = balance_ as UInt<32>;
          const toMain = hasMethod && main && !(action.payload?.subkey ?? subkey);
          toAccount = toMain ? main!.address : address;
          if (toMain)
            return transact(
              userDepositContract,
              'withdrawToBeneficiary',
              [action.meta.amount, main!.address],
              deps,
              { subkey: true, error: ErrorCodes.UDC_WITHDRAW_FAILED },
            );
          else
            return transact(userDepositContract, 'withdraw', [action.meta.amount], deps, {
              subkey: true,
              error: ErrorCodes.UDC_WITHDRAW_FAILED,
            });
        }),
        retryWhile(intervalFromConfig(config$), { onErrors: commonTxErrors, log: log.info }),
        mergeMap(([, { transactionHash, blockNumber }]) =>
          action$.pipe(
            filter(newBlock.is),
            exhaustMap(() =>
              defer(async () => userDepositContract.callStatic.balances(address)).pipe(
                catchAndLog({ onErrors: networkErrors, log: log.info }),
              ),
            ),
            filter((newBalance) => newBalance.lt(balance)),
            take(1),
            map((newBalance) =>
              udcWithdraw.success(
                {
                  withdrawal: balance.sub(newBalance) as UInt<32>,
                  beneficiary: toAccount,
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
