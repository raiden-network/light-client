import { makeRaidens, makeTransaction, waitBlock } from '../mocks';
import { bigNumberify, parseEther } from 'ethers/utils';
import { udcWithdraw, udcWithdrawn } from 'raiden-ts/services/actions';
import { confirmationBlocks } from '../fixtures';
import { Hash, UInt } from 'raiden-ts/utils/types';
import { Zero } from 'ethers/constants';

describe('udcWithdraw', () => {
  test('planned withdraw picked on startup', async () => {
    const [raiden] = await makeRaidens(1, false);
    const amount = parseEther('5');
    const withdrawBlock = bigNumberify(500);
    raiden.deps.userDepositContract.functions.withdraw_plans.mockResolvedValue({
      amount: amount,
      withdraw_block: withdrawBlock,
      0: amount,
      1: withdrawBlock,
    });
    await raiden.start();
    expect(raiden.output).toContainEqual(
      udcWithdraw.success({ block: withdrawBlock.toNumber() }, { amount: amount as UInt<32> }),
    );
  });

  test('withdraw request: success', async () => {
    const [raiden] = await makeRaidens(1);
    const amount = parseEther('5');
    const withdrawBlock = bigNumberify(500);
    raiden.deps.userDepositContract.functions.withdraw_plans.mockResolvedValue({
      amount: amount,
      withdraw_block: withdrawBlock,
      0: amount,
      1: withdrawBlock,
    });
    const planTx = makeTransaction(1);
    raiden.deps.userDepositContract.functions.planWithdraw.mockResolvedValue(planTx);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    raiden.deps.provider.getTransactionReceipt.mockResolvedValue({
      blockNumber: raiden.deps.provider.blockNumber,
    });

    raiden.store.dispatch(udcWithdraw.request({}, { amount: amount as UInt<32> }));

    await waitBlock(raiden.deps.provider.blockNumber + confirmationBlocks);
    expect(raiden.output).toContainEqual(
      udcWithdraw.success(
        { block: withdrawBlock.toNumber(), txHash: planTx.hash as Hash },
        { amount: amount as UInt<32> },
      ),
    );
  });

  test('withdraw require: zero amount', async () => {
    const [raiden] = await makeRaidens(1);
    raiden.store.dispatch(udcWithdraw.request({}, { amount: Zero as UInt<32> }));
    await waitBlock();
    expect(raiden.output).toContainEqual(
      udcWithdraw.failure(expect.any(Error), { amount: Zero as UInt<32> }),
    );
  });

  test('withdraw require: not enough balance', async () => {
    const [raiden] = await makeRaidens(1);
    const amount = parseEther('500');
    raiden.store.dispatch(udcWithdraw.request({}, { amount: amount as UInt<32> }));
    await waitBlock();
    expect(raiden.output).toContainEqual(
      udcWithdraw.failure(expect.any(Error), { amount: amount as UInt<32> }),
    );
  });

  test('withdraw is successful', async () => {
    const [raiden] = await makeRaidens(1);
    const amount = parseEther('5');
    const withdrawTx = makeTransaction(1);
    raiden.deps.userDepositContract.functions.withdraw.mockResolvedValue(withdrawTx);
    raiden.deps.userDepositContract.functions.balances
      .mockClear()
      .mockResolvedValueOnce(parseEther('5'))
      .mockResolvedValueOnce(Zero);
    raiden.store.dispatch(udcWithdraw.success({ block: 200 }, { amount: amount as UInt<32> }));
    await waitBlock(200);
    expect(raiden.output).toContainEqual(
      udcWithdrawn(
        {
          withdrawal: amount as UInt<32>,
          txHash: withdrawTx.hash as Hash,
        },
        { amount: amount as UInt<32> },
      ),
    );
  });

  test('withdraw: not balance remaining', async () => {
    const [raiden] = await makeRaidens(1);
    const amount = parseEther('5');
    const withdrawTx = makeTransaction(1);
    raiden.deps.userDepositContract.functions.withdraw.mockResolvedValue(withdrawTx);
    raiden.deps.userDepositContract.functions.balances.mockClear().mockResolvedValueOnce(Zero);
    raiden.store.dispatch(udcWithdraw.success({ block: 200 }, { amount: amount as UInt<32> }));
    await waitBlock(200);
    expect(raiden.output).toContainEqual(
      udcWithdraw.failure(expect.any(Error), { amount: amount as UInt<32> }),
    );
  });
});
