import { confirmationBlocks } from '../fixtures';
import { makeRaidens, makeStruct, makeTransaction, waitBlock } from '../mocks';

import { BigNumber } from '@ethersproject/bignumber';
import { Zero } from '@ethersproject/constants';
import { parseEther } from '@ethersproject/units';

import { udcWithdraw, udcWithdrawPlan } from '@/services/actions';
import type { Hash, UInt } from '@/utils/types';

describe('udcWithdrawPlan', () => {
  test('planned withdraw picked on startup', async () => {
    const [raiden] = await makeRaidens(1, false);
    const amount = parseEther('5');
    const withdrawBlock = BigNumber.from(500);
    raiden.deps.userDepositContract.withdraw_plans.mockResolvedValue(
      makeStruct(['amount', 'withdraw_block'] as const, [amount, withdrawBlock]),
    );
    await raiden.start();
    expect(raiden.output).toContainEqual(
      udcWithdrawPlan.success(
        { block: withdrawBlock.toNumber(), confirmed: true },
        { amount: amount as UInt<32> },
      ),
    );
  });

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

  test('withdraw is successful', async () => {
    const [raiden] = await makeRaidens(1);
    const amount = parseEther('5');
    const withdrawTx = makeTransaction(1);
    raiden.deps.userDepositContract.withdraw.mockResolvedValue(withdrawTx);
    raiden.deps.userDepositContract.balances
      .mockClear()
      .mockResolvedValueOnce(parseEther('5'))
      .mockResolvedValueOnce(Zero);
    raiden.store.dispatch(
      udcWithdrawPlan.success({ block: 200, confirmed: true }, { amount: amount as UInt<32> }),
    );
    await waitBlock(200);
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

  test('withdraw: not balance remaining', async () => {
    const [raiden] = await makeRaidens(1);
    const amount = parseEther('5');
    const withdrawTx = makeTransaction(1);
    raiden.deps.userDepositContract.withdraw.mockResolvedValue(withdrawTx);
    raiden.deps.userDepositContract.balances.mockClear().mockResolvedValueOnce(Zero);
    raiden.store.dispatch(
      udcWithdrawPlan.success({ block: 200, confirmed: true }, { amount: amount as UInt<32> }),
    );
    await waitBlock(200);
    await waitBlock();
    expect(raiden.output).toContainEqual(
      udcWithdrawPlan.failure(expect.any(Error), { amount: amount as UInt<32> }),
    );
  });
});
