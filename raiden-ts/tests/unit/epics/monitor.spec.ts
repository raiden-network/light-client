/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  makeLog,
  makeAddress,
  makeHash,
  makeRaidens,
  waitBlock,
  providersEmit,
  makeTransaction,
  sleep,
  makeRaiden,
  mockedSignMessage,
  originalSignMessage,
} from '../mocks';
import {
  tokenNetwork,
  token,
  deposit,
  amount,
  ensureChannelIsOpen,
  ensureChannelIsDeposited,
  ensureTransferUnlocked,
  ensureTransferPending,
  getChannel,
  id,
} from '../fixtures';

import { bigNumberify, defaultAbiCoder } from 'ethers/utils';
import { Zero, WeiPerEther, Two, MaxUint256 } from 'ethers/constants';
import { first, pluck } from 'rxjs/operators';

import { Capabilities } from 'raiden-ts/constants';
import { raidenConfigUpdate, raidenShutdown } from 'raiden-ts/actions';
import { MessageType } from 'raiden-ts/messages/types';
import { createBalanceHash } from 'raiden-ts/messages/utils';
import { messageGlobalSend } from 'raiden-ts/messages/actions';
import { UInt, Hash } from 'raiden-ts/utils/types';

import { udcDeposit, msBalanceProofSent } from 'raiden-ts/services/actions';
import { ErrorCodes } from 'raiden-ts/utils/error';

test('monitorUdcBalanceEpic', async () => {
  expect.assertions(5);

  const raiden = await makeRaiden(undefined, false);
  const { userDepositContract } = raiden.deps;
  userDepositContract.functions.effectiveBalance.mockResolvedValue(Zero);
  userDepositContract.functions.total_deposit.mockResolvedValue(Zero);

  await raiden.start();
  await sleep();
  expect(raiden.output).toContainEqual(
    udcDeposit.success({ balance: Zero as UInt<32> }, { totalDeposit: Zero as UInt<32> }),
  );
  await expect(
    raiden.deps.latest$.pipe(pluck('udcBalance'), first()).toPromise(),
  ).resolves.toEqual(Zero);

  const balance = bigNumberify(23) as UInt<32>;
  userDepositContract.functions.effectiveBalance.mockResolvedValue(balance);
  userDepositContract.functions.total_deposit.mockResolvedValue(balance);
  await waitBlock();

  expect(raiden.output).toContainEqual(udcDeposit.success({ balance }, { totalDeposit: balance }));
  await expect(
    raiden.deps.latest$.pipe(pluck('udcBalance'), first()).toPromise(),
  ).resolves.toEqual(balance);
  expect(userDepositContract.functions.effectiveBalance).toHaveBeenCalledTimes(2);
});

describe('monitorRequestEpic', () => {
  test('success: receiving a transfer triggers monitoring', async () => {
    expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    const monitoringReward = bigNumberify(5) as UInt<32>;

    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([partner, raiden], amount);

    await waitBlock();
    const partnerBP = getChannel(raiden, partner).partner.balanceProof;

    expect(raiden.output).toContainEqual(
      messageGlobalSend(
        {
          message: {
            type: MessageType.MONITOR_REQUEST,
            balance_proof: {
              chain_id: partnerBP.chainId,
              token_network_address: tokenNetwork,
              channel_identifier: partnerBP.channelId,
              nonce: partnerBP.nonce,
              balance_hash: createBalanceHash(partnerBP),
              additional_hash: partnerBP.additionalHash,
              signature: partnerBP.signature,
            },
            non_closing_participant: raiden.address,
            non_closing_signature: expect.any(String),
            monitoring_service_contract_address: expect.any(String),
            reward_amount: monitoringReward,
            signature: expect.any(String),
          },
        },
        { roomName: expect.stringMatching(/_monitoring$/) },
      ),
    );
  });

  test('success: token without known rateToSvt gets monitored', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(raidenConfigUpdate({ rateToSvt: {} }));
    expect(
      (await raiden.deps.latest$.pipe(pluck('udcBalance'), first()).toPromise()).gte(
        raiden.config.monitoringReward!,
      ),
    ).toBe(true);
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([partner, raiden], amount);
    await waitBlock();

    const partnerBP = getChannel(raiden, partner).partner.balanceProof;

    expect(raiden.output).toContainEqual(
      messageGlobalSend(
        {
          message: {
            type: MessageType.MONITOR_REQUEST,
            balance_proof: {
              chain_id: partnerBP.chainId,
              token_network_address: tokenNetwork,
              channel_identifier: partnerBP.channelId,
              nonce: partnerBP.nonce,
              balance_hash: createBalanceHash(partnerBP),
              additional_hash: partnerBP.additionalHash,
              signature: partnerBP.signature,
            },
            non_closing_participant: raiden.address,
            non_closing_signature: expect.any(String),
            monitoring_service_contract_address: expect.any(String),
            reward_amount: raiden.config.monitoringReward!,
            signature: expect.any(String),
          },
        },
        { roomName: expect.stringMatching(/_monitoring$/) },
      ),
    );
  });

  test('ignore: not enough udcBalance', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const { userDepositContract } = raiden.deps;
    const monitoringReward = bigNumberify(5) as UInt<32>;
    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );

    userDepositContract.functions.effectiveBalance.mockResolvedValue(monitoringReward.sub(1));
    userDepositContract.functions.total_deposit.mockResolvedValue(monitoringReward.sub(1));
    await waitBlock();

    const balance = monitoringReward.sub(1) as UInt<32>;
    expect(raiden.output).toContainEqual(
      udcDeposit.success({ balance }, { totalDeposit: balance }),
    );

    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([partner, raiden], amount);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageGlobalSend(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
  });

  test('ignore: config.monitoringReward unset', async () => {
    expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(raidenConfigUpdate({ monitoringReward: null }));

    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([partner, raiden], amount);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageGlobalSend(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
  });

  test('ignore: signing rejected not fatal', async () => {
    expect.assertions(3);

    const [raiden, partner] = await makeRaidens(2);
    const monitoringReward = bigNumberify(5) as UInt<32>;
    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferPending([partner, raiden], amount);

    // fails on RequestMonitoring message
    mockedSignMessage.mockImplementation(async (signer, message, opts) => {
      if (message.type === MessageType.MONITOR_REQUEST) throw new Error('Signature rejected');
      return originalSignMessage(signer, message, opts);
    });

    await ensureTransferUnlocked([partner, raiden], amount);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageGlobalSend(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
    expect(raiden.output).not.toContainEqual(raidenShutdown(expect.anything()));
    /* We expect 4 times because in the ensureTransferUnlocked after the transfer/success  action
     we have MonitorRequest, SecretReveal, PFSCapacityUpdate which fail*/
    expect(mockedSignMessage).toHaveBeenCalledWith(
      raiden.deps.signer,
      expect.objectContaining({ type: MessageType.MONITOR_REQUEST }),
      expect.anything(),
    );
  });

  test('ignore: non economically viable channels', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const monitoringReward = bigNumberify(5) as UInt<32>;
    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);

    // transfer <= monitoringReward isn't worth to be monitored
    await ensureTransferUnlocked([partner, raiden], monitoringReward.sub(1) as UInt<32>);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageGlobalSend(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
  });

  test('ignore: non unlocked amount', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const monitoringReward = bigNumberify(5) as UInt<32>;
    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          // 'Receive' should be auto-enabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);

    // transfer <= monitoringReward isn't worth to be monitored
    await ensureTransferPending([partner, raiden], amount);
    await waitBlock();

    expect(raiden.output).not.toContainEqual(
      messageGlobalSend(
        { message: expect.objectContaining({ type: MessageType.MONITOR_REQUEST }) },
        expect.anything(),
      ),
    );
  });
});

test('msMonitorNewBPEpic', async () => {
  expect.assertions(1);

  const [raiden, partner] = await makeRaidens(2);
  await ensureChannelIsOpen([raiden, partner]);

  const { monitoringServiceContract } = raiden.deps;
  const monitoringService = makeAddress();
  const nonce = Two as UInt<8>;
  const txHash = makeHash();

  // emit a NewBalanceProofReceived event
  await providersEmit(
    {},
    makeLog({
      transactionHash: txHash,
      filter: monitoringServiceContract.filters.NewBalanceProofReceived(
        null,
        null,
        null,
        nonce,
        monitoringService,
        raiden.address,
      ),
      data: defaultAbiCoder.encode(
        ['address', 'uint256', 'uint256'], // first 3 event arguments, non-indexed
        [tokenNetwork, id, raiden.config.monitoringReward!],
      ),
    }),
  );
  await waitBlock();

  expect(raiden.output).toContainEqual(
    msBalanceProofSent({
      tokenNetwork,
      partner: partner.address,
      id,
      reward: raiden.config.monitoringReward!,
      nonce,
      monitoringService,
      txHash,
      txBlock: expect.any(Number),
      confirmed: undefined,
    }),
  );
});

describe('udcDepositEpic', () => {
  const deposit = bigNumberify(10) as UInt<32>;

  test('fails if not enough balance', async () => {
    expect.assertions(1);

    const raiden = await makeRaiden(undefined, false);
    const { userDepositContract } = raiden.deps;
    userDepositContract.functions.effectiveBalance.mockResolvedValue(Zero);
    userDepositContract.functions.total_deposit.mockResolvedValue(Zero);

    const tokenContract = raiden.deps.getTokenContract(
      await raiden.deps.userDepositContract.functions.token(),
    );
    tokenContract.functions.balanceOf.mockResolvedValue(deposit.sub(1));

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
    userDepositContract.functions.effectiveBalance.mockResolvedValue(Zero);
    userDepositContract.functions.total_deposit.mockResolvedValue(Zero);

    const tokenContract = raiden.deps.getTokenContract(
      await raiden.deps.userDepositContract.functions.token(),
    );
    // not enough allowance, but not zero, need to reset
    tokenContract.functions.allowance.mockResolvedValue(deposit.sub(1));

    tokenContract.functions.approve.mockResolvedValue(
      makeTransaction(0, { to: tokenContract.address }),
    );
    // resetAllowance$ succeeds, but then actual approve fails
    tokenContract.functions.approve.mockResolvedValueOnce(
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
    expect(tokenContract.functions.approve).toHaveBeenCalledTimes(2);
    expect(tokenContract.functions.approve).toHaveBeenCalledWith(userDepositContract.address, 0);
    expect(tokenContract.functions.approve).toHaveBeenCalledWith(
      userDepositContract.address,
      raiden.config.minimumAllowance,
    );
  });

  test('deposit tx fails', async () => {
    expect.assertions(1);

    const raiden = await makeRaiden(undefined, false);
    const { userDepositContract } = raiden.deps;
    userDepositContract.functions.effectiveBalance.mockResolvedValue(Zero);
    userDepositContract.functions.total_deposit.mockResolvedValue(Zero);

    const tokenContract = raiden.deps.getTokenContract(
      await raiden.deps.userDepositContract.functions.token(),
    );

    const approveTx = makeTransaction(undefined, { to: tokenContract.address });
    tokenContract.functions.approve.mockResolvedValue(approveTx);

    const depositTx = makeTransaction(0, { to: userDepositContract.address });
    userDepositContract.functions.deposit.mockResolvedValue(depositTx);

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

    const prevDeposit = bigNumberify(330) as UInt<32>;
    const balance = prevDeposit.add(deposit) as UInt<32>;
    const raiden = await makeRaiden(undefined, false);
    const { userDepositContract } = raiden.deps;
    userDepositContract.functions.effectiveBalance.mockResolvedValue(prevDeposit);
    userDepositContract.functions.total_deposit.mockResolvedValue(prevDeposit);

    const tokenContract = raiden.deps.getTokenContract(
      await raiden.deps.userDepositContract.functions.token(),
    );
    // allowance first isn't enough but not zero, resetAllowance needed
    tokenContract.functions.allowance.mockResolvedValue(deposit.sub(1));

    const approveTx = makeTransaction(undefined, { to: tokenContract.address });
    tokenContract.functions.approve.mockResolvedValue(approveTx);
    // first approve tx fail with nonce error, replacement fee error should be retried
    const approveFailTx: typeof approveTx = makeTransaction(undefined, {
      to: tokenContract.address,
      wait: jest.fn().mockRejectedValue(new Error('replacement fee too low')),
    });
    tokenContract.functions.approve.mockResolvedValueOnce(approveFailTx);

    const depositTx = makeTransaction(undefined, { to: userDepositContract.address });
    userDepositContract.functions.deposit.mockResolvedValue(depositTx);
    userDepositContract.functions.effectiveBalance.mockResolvedValue(balance);

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
    expect(tokenContract.functions.approve).toHaveBeenCalledTimes(3);
    expect(approveTx.wait).toHaveBeenCalledTimes(2);
    expect(tokenContract.functions.approve).toHaveBeenCalledWith(
      userDepositContract.address,
      MaxUint256,
    );
    expect(userDepositContract.functions.deposit).toHaveBeenCalledTimes(1);
    expect(userDepositContract.functions.deposit).toHaveBeenCalledWith(
      raiden.address,
      deposit.add(prevDeposit),
    );
    expect(depositTx.wait).toHaveBeenCalledTimes(1);
  });
});
