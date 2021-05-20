import { confirmationBlocks } from './fixtures';
import { makeRaiden, makeRaidens, makeStruct, makeTransaction, waitBlock } from './mocks';

import { BigNumber } from '@ethersproject/bignumber';
import { MaxUint256, Zero } from '@ethersproject/constants';
import { parseEther } from '@ethersproject/units';
import { first, pluck } from 'rxjs/operators';

import { raidenConfigUpdate } from '@/actions';
import { udcDeposit, udcWithdraw, udcWithdrawPlan } from '@/services/actions';
import { ErrorCodes } from '@/utils/error';
import type { Hash, UInt } from '@/utils/types';

import { sleep } from '../utils';

test('monitorUdcBalanceEpic', async () => {
  expect.assertions(5);

  const raiden = await makeRaiden(undefined, false);
  const { userDepositContract } = raiden.deps;
  userDepositContract.effectiveBalance.mockResolvedValue(Zero);
  userDepositContract.total_deposit.mockResolvedValue(Zero);

  await raiden.start();
  await sleep();
  expect(raiden.output).toContainEqual(
    udcDeposit.success({ balance: Zero as UInt<32> }, { totalDeposit: Zero as UInt<32> }),
  );
  await expect(
    raiden.deps.latest$.pipe(pluck('udcDeposit', 'balance'), first()).toPromise(),
  ).resolves.toEqual(Zero);

  const balance = BigNumber.from(23) as UInt<32>;
  userDepositContract.effectiveBalance.mockResolvedValue(balance);
  userDepositContract.total_deposit.mockResolvedValue(balance);
  await waitBlock();

  expect(raiden.output).toContainEqual(udcDeposit.success({ balance }, { totalDeposit: balance }));
  await expect(
    raiden.deps.latest$.pipe(pluck('udcDeposit', 'balance'), first()).toPromise(),
  ).resolves.toEqual(balance);
  expect(userDepositContract.effectiveBalance).toHaveBeenCalledTimes(2);
});

describe('udcDepositEpic', () => {
  const deposit = BigNumber.from(10) as UInt<32>;

  test('fails if not enough balance', async () => {
    expect.assertions(1);

    const raiden = await makeRaiden(undefined, false);
    const { userDepositContract } = raiden.deps;
    userDepositContract.effectiveBalance.mockResolvedValue(Zero);
    userDepositContract.total_deposit.mockResolvedValue(Zero);

    const tokenContract = raiden.deps.getTokenContract(
      await raiden.deps.userDepositContract.token(),
    );
    tokenContract.balanceOf.mockResolvedValue(deposit.sub(1));

    await raiden.start();
    raiden.store.dispatch(udcDeposit.request({ deposit }, { totalDeposit: deposit }));
    await waitBlock();

    expect(raiden.output).toContainEqual(
      udcDeposit.failure(
        expect.objectContaining({ message: ErrorCodes.RDN_INSUFFICIENT_BALANCE }),
        { totalDeposit: deposit },
      ),
    );
  });

  test('approve tx fails with resetAllowance needed', async () => {
    expect.assertions(4);

    const raiden = await makeRaiden(undefined, false);
    const { userDepositContract } = raiden.deps;
    userDepositContract.effectiveBalance.mockResolvedValue(Zero);
    userDepositContract.total_deposit.mockResolvedValue(Zero);

    const tokenContract = raiden.deps.getTokenContract(
      await raiden.deps.userDepositContract.token(),
    );
    // not enough allowance, but not zero, need to reset
    tokenContract.allowance.mockResolvedValue(deposit.sub(1));

    tokenContract.approve.mockResolvedValue(makeTransaction(0, { to: tokenContract.address }));
    // resetAllowance$ succeeds, but then actual approve fails
    tokenContract.approve.mockResolvedValueOnce(
      makeTransaction(undefined, { to: tokenContract.address }),
    );

    await raiden.start();
    raiden.store.dispatch(udcDeposit.request({ deposit }, { totalDeposit: deposit }));
    await waitBlock();

    expect(raiden.output).toContainEqual(
      udcDeposit.failure(
        expect.objectContaining({ message: ErrorCodes.RDN_APPROVE_TRANSACTION_FAILED }),
        { totalDeposit: deposit },
      ),
    );
    expect(tokenContract.approve).toHaveBeenCalledTimes(2);
    expect(tokenContract.approve).toHaveBeenCalledWith(userDepositContract.address, 0);
    expect(tokenContract.approve).toHaveBeenCalledWith(
      userDepositContract.address,
      raiden.config.minimumAllowance,
    );
  });

  test('deposit tx fails', async () => {
    expect.assertions(1);

    const raiden = await makeRaiden(undefined, false);
    const { userDepositContract } = raiden.deps;
    userDepositContract.effectiveBalance.mockResolvedValue(Zero);
    userDepositContract.total_deposit.mockResolvedValue(Zero);

    const tokenContract = raiden.deps.getTokenContract(
      await raiden.deps.userDepositContract.token(),
    );

    const approveTx = makeTransaction(undefined, { to: tokenContract.address });
    tokenContract.approve.mockResolvedValue(approveTx);

    const depositTx = makeTransaction(0, { to: userDepositContract.address });
    userDepositContract.deposit.mockResolvedValue(depositTx);

    await raiden.start();
    raiden.store.dispatch(udcDeposit.request({ deposit }, { totalDeposit: deposit }));
    await waitBlock();

    expect(raiden.output).toContainEqual(
      udcDeposit.failure(
        expect.objectContaining({ message: ErrorCodes.RDN_DEPOSIT_TRANSACTION_FAILED }),
        { totalDeposit: deposit },
      ),
    );
  });

  test('success', async () => {
    expect.assertions(8);

    const prevDeposit = BigNumber.from(330) as UInt<32>;
    const balance = prevDeposit.add(deposit) as UInt<32>;
    const raiden = await makeRaiden(undefined, false);
    const { userDepositContract } = raiden.deps;
    userDepositContract.effectiveBalance.mockResolvedValue(prevDeposit);
    userDepositContract.total_deposit.mockResolvedValue(prevDeposit);

    const tokenContract = raiden.deps.getTokenContract(
      await raiden.deps.userDepositContract.token(),
    );
    // allowance first isn't enough but not zero, resetAllowance needed
    tokenContract.allowance.mockResolvedValue(deposit.sub(1));

    const approveTx = makeTransaction(undefined, { to: tokenContract.address });
    tokenContract.approve.mockResolvedValue(approveTx);
    // first approve tx fail with nonce error, replacement fee error should be retried
    const approveFailTx: typeof approveTx = makeTransaction(undefined, {
      to: tokenContract.address,
      wait: jest.fn().mockRejectedValue(new Error('replacement fee too low')),
    });
    tokenContract.approve.mockResolvedValueOnce(approveFailTx);

    const depositTx = makeTransaction(undefined, { to: userDepositContract.address });
    userDepositContract.deposit.mockResolvedValue(depositTx);
    userDepositContract.effectiveBalance.mockResolvedValue(balance);

    await raiden.start();
    raiden.store.dispatch(udcDeposit.request({ deposit }, { totalDeposit: balance }));
    await waitBlock();
    // give some time for the `approve` retry
    await sleep(raiden.deps.provider.pollingInterval * 2);

    // result is undefined on success as the respective udcDeposit.success is emitted by the
    // channelMonitoredEpic, which monitors the blockchain for ChannelNewDeposit events
    expect(raiden.output).not.toContainEqual(
      udcDeposit.failure(expect.any(Error), expect.anything()),
    );
    expect(raiden.output).toContainEqual(
      udcDeposit.success(
        { balance, txHash: depositTx.hash! as Hash, txBlock: expect.any(Number), confirmed: true },
        { totalDeposit: balance },
      ),
    );
    expect(tokenContract.approve).toHaveBeenCalledTimes(3);
    expect(approveTx.wait).toHaveBeenCalledTimes(2);
    expect(tokenContract.approve).toHaveBeenCalledWith(userDepositContract.address, MaxUint256);
    expect(userDepositContract.deposit).toHaveBeenCalledTimes(1);
    expect(userDepositContract.deposit).toHaveBeenCalledWith(
      raiden.address,
      deposit.add(prevDeposit),
    );
    expect(depositTx.wait).toHaveBeenCalledTimes(1);
  });
});

describe('udcWithdrawPlan', () => {
  test('withdraw request: success', async () => {
    const [raiden] = await makeRaidens(1);
    const amount = parseEther('5');
    const withdrawBlock = BigNumber.from(500);
    raiden.deps.userDepositContract.withdraw_plans.mockResolvedValue(
      makeStruct(['amount', 'withdraw_block'] as const, [amount, withdrawBlock]),
    );
    raiden.deps.userDepositContract.withdraw_plans.mockResolvedValueOnce(
      makeStruct(['amount', 'withdraw_block'] as const, [Zero, Zero]),
    );
    const planTx = makeTransaction(1);
    raiden.deps.userDepositContract.planWithdraw.mockResolvedValue(planTx);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    raiden.deps.provider.getTransactionReceipt.mockResolvedValue({
      blockNumber: raiden.deps.provider.blockNumber,
    });

    raiden.store.dispatch(udcWithdrawPlan.request(undefined, { amount: amount as UInt<32> }));

    await waitBlock(raiden.deps.provider.blockNumber + confirmationBlocks);
    await waitBlock();
    expect(raiden.output).toContainEqual(
      udcWithdrawPlan.success(
        {
          block: withdrawBlock.toNumber(),
          txHash: planTx.hash as Hash,
          txBlock: expect.any(Number),
          confirmed: undefined,
        },
        { amount: amount as UInt<32> },
      ),
    );
  });

  test('withdraw require: zero amount', async () => {
    const [raiden] = await makeRaidens(1);
    raiden.store.dispatch(udcWithdrawPlan.request(undefined, { amount: Zero as UInt<32> }));
    await waitBlock();
    expect(raiden.output).toContainEqual(
      udcWithdrawPlan.failure(expect.any(Error), { amount: Zero as UInt<32> }),
    );
  });

  test('withdraw require: not enough balance', async () => {
    const [raiden] = await makeRaidens(1);
    const amount = parseEther('500');
    raiden.store.dispatch(udcWithdrawPlan.request(undefined, { amount: amount as UInt<32> }));
    await waitBlock();
    expect(raiden.output).toContainEqual(
      udcWithdrawPlan.failure(expect.any(Error), { amount: amount as UInt<32> }),
    );
  });
});

describe('udcAutoWithdrawEpic', () => {
  test('planned withdraw picked on startup', async () => {
    expect.assertions(1);
    const raiden = await makeRaiden(undefined, false);

    const amount = parseEther('5');
    const withdrawBlock = BigNumber.from(500);
    raiden.deps.userDepositContract.withdraw_plans.mockResolvedValue(
      makeStruct(['amount', 'withdraw_block'] as const, [amount, withdrawBlock]),
    );

    await raiden.start();
    await waitBlock();
    await waitBlock(withdrawBlock.toNumber());

    expect(raiden.output).toContainEqual(
      udcWithdraw.request(undefined, { amount: amount as UInt<32> }),
    );
  });

  test('detect later planned withdraw', async () => {
    expect.assertions(2);
    const raiden = await makeRaiden();

    await waitBlock();
    await waitBlock(raiden.deps.provider.blockNumber + 105);
    expect(raiden.output).not.toContainEqual(
      udcWithdraw.request(expect.anything(), expect.anything()),
    );

    const amount = parseEther('5');
    const withdrawBlock = BigNumber.from(raiden.deps.provider.blockNumber + 120);
    raiden.deps.userDepositContract.withdraw_plans.mockResolvedValue(
      makeStruct(['amount', 'withdraw_block'] as const, [amount, withdrawBlock]),
    );

    await waitBlock(withdrawBlock.toNumber() - 10);
    await waitBlock(withdrawBlock.toNumber());

    expect(raiden.output).toContainEqual(
      udcWithdraw.request(undefined, { amount: amount as UInt<32> }),
    );
  });
});

describe('udcWithdraw', () => {
  test('success', async () => {
    expect.assertions(1);

    const amount = parseEther('5');
    const withdrawTx = makeTransaction(1);
    const raiden = await makeRaiden(undefined, false);

    raiden.store.dispatch(raidenConfigUpdate({ autoUDCWithdraw: false }));
    raiden.deps.userDepositContract.withdraw.mockResolvedValue(withdrawTx);
    raiden.deps.userDepositContract.balances
      .mockClear()
      .mockResolvedValueOnce(parseEther('5'))
      .mockResolvedValueOnce(Zero);

    await raiden.start();
    await waitBlock(200);

    raiden.store.dispatch(udcWithdraw.request(undefined, { amount: amount as UInt<32> }));
    await waitBlock();

    expect(raiden.output).toContainEqual(
      udcWithdraw.success(
        {
          withdrawal: amount as UInt<32>,
          txHash: withdrawTx.hash as Hash,
          txBlock: expect.any(Number),
          confirmed: true,
        },
        { amount: amount as UInt<32> },
      ),
    );
  });

  test('tx failed', async () => {
    expect.assertions(1);

    const amount = parseEther('5');
    const withdrawTx = makeTransaction(0); // failed tx
    const raiden = await makeRaiden(undefined, false);

    raiden.store.dispatch(raidenConfigUpdate({ autoUDCWithdraw: false }));
    raiden.deps.userDepositContract.withdraw.mockResolvedValue(withdrawTx);
    raiden.deps.userDepositContract.balances
      .mockClear()
      .mockResolvedValueOnce(parseEther('5'))
      .mockResolvedValueOnce(Zero);

    await raiden.start();
    await waitBlock(200);

    raiden.store.dispatch(udcWithdraw.request(undefined, { amount: amount as UInt<32> }));
    await waitBlock();

    expect(raiden.output).toContainEqual(
      udcWithdraw.failure(expect.any(Error), { amount: amount as UInt<32> }),
    );
  });
});
