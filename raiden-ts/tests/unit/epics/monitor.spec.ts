/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  raidenEpicDeps,
  makeLog,
  makeAddress,
  makeHash,
  makeRaidens,
  waitBlock,
  providersEmit,
  makeTransaction,
  sleep,
  makeRaiden,
} from '../mocks';
import {
  epicFixtures,
  tokenNetwork,
  token,
  ensureChannelIsOpen,
  ensureChannelIsDeposited,
  ensureTransferUnlocked,
  getChannel,
  id,
} from '../fixtures';

import { bigNumberify, BigNumberish, defaultAbiCoder } from 'ethers/utils';
import { Zero, WeiPerEther, Two, MaxUint256 } from 'ethers/constants';
import { of } from 'rxjs';
import { first, pluck } from 'rxjs/operators';

import { Capabilities } from 'raiden-ts/constants';
import { raidenConfigUpdate } from 'raiden-ts/actions';
import { MessageType, LockedTransfer } from 'raiden-ts/messages/types';
import { signMessage, createBalanceHash } from 'raiden-ts/messages/utils';
import { tokenMonitored, channelOpen, channelDeposit } from 'raiden-ts/channels/actions';
import { messageReceived, messageGlobalSend } from 'raiden-ts/messages/actions';
import { transferGenerateAndSignEnvelopeMessageEpic } from 'raiden-ts/transfers/epics';
import { UInt, decode, Hash } from 'raiden-ts/utils/types';
import {
  makeMessageId,
  makeSecret,
  getSecrethash,
  makePaymentId,
  getLocksroot,
} from 'raiden-ts/transfers/utils';
import { monitorRequestEpic } from 'raiden-ts/services/epics';
import { udcDeposit, msBalanceProofSent } from 'raiden-ts/services/actions';
import { transferProcessed, transferSecretRegister } from 'raiden-ts/transfers/actions';
import { channelKey } from 'raiden-ts/channels/utils';
import { Direction } from 'raiden-ts/transfers/state';
import { ErrorCodes } from 'raiden-ts/utils/error';

test('monitorUdcBalanceEpic', async () => {
  expect.assertions(5);

  const raiden = await makeRaiden(undefined, false);
  const { userDepositContract } = raiden.deps;
  userDepositContract.functions.effectiveBalance.mockResolvedValue(Zero);

  await raiden.start();
  expect(raiden.output).toContainEqual(
    udcDeposit.success(undefined, { totalDeposit: Zero as UInt<32> }),
  );
  await expect(
    raiden.deps.latest$.pipe(pluck('udcBalance'), first()).toPromise(),
  ).resolves.toEqual(Zero);

  const balance = bigNumberify(23) as UInt<32>;
  userDepositContract.functions.effectiveBalance.mockResolvedValue(balance);
  await waitBlock();

  expect(raiden.output).toContainEqual(udcDeposit.success(undefined, { totalDeposit: balance }));
  await expect(
    raiden.deps.latest$.pipe(pluck('udcBalance'), first()).toPromise(),
  ).resolves.toEqual(balance);
  expect(userDepositContract.functions.effectiveBalance).toHaveBeenCalledTimes(2);
});

describe('monitorRequestEpic', () => {
  let depsMock: ReturnType<typeof raidenEpicDeps>;
  let token: ReturnType<typeof epicFixtures>['token'],
    tokenNetwork: ReturnType<typeof epicFixtures>['tokenNetwork'],
    channelId: ReturnType<typeof epicFixtures>['channelId'],
    partner: ReturnType<typeof epicFixtures>['partner'],
    settleTimeout: ReturnType<typeof epicFixtures>['settleTimeout'],
    isFirstParticipant: ReturnType<typeof epicFixtures>['isFirstParticipant'],
    txHash: ReturnType<typeof epicFixtures>['txHash'],
    partnerSigner: ReturnType<typeof epicFixtures>['partnerSigner'],
    key: ReturnType<typeof epicFixtures>['key'],
    action$: ReturnType<typeof epicFixtures>['action$'],
    state$: ReturnType<typeof epicFixtures>['state$'];

  const monitoringReward = bigNumberify(5) as UInt<32>;

  beforeEach(async () => {
    depsMock = raidenEpicDeps();
    ({
      token,
      tokenNetwork,
      channelId,
      partner,
      settleTimeout,
      isFirstParticipant,
      txHash,
      partnerSigner,
      key,
      action$,
      state$,
    } = epicFixtures(depsMock));

    [
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          [Capabilities.NO_MEDIATE]: true,
          // 'noReceive' should be auto-disabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
      tokenMonitored({ token, tokenNetwork }),
      channelOpen.success(
        {
          id: channelId,
          settleTimeout,
          isFirstParticipant,
          token,
          txHash,
          txBlock: 121,
          confirmed: true,
        },
        { tokenNetwork, partner },
      ),
      channelDeposit.success(
        {
          id: channelId,
          participant: depsMock.address,
          totalDeposit: bigNumberify(500) as UInt<32>,
          txHash,
          txBlock: 122,
          confirmed: true,
        },
        { tokenNetwork, partner },
      ),
      channelDeposit.success(
        {
          id: channelId,
          participant: partner,
          totalDeposit: bigNumberify(500) as UInt<32>,
          txHash,
          txBlock: 122,
          confirmed: true,
        },
        { tokenNetwork, partner },
      ),
    ].forEach((a) => action$.next(a));
  });

  async function receiveTransfer(value: BigNumberish, unlock = true) {
    const amount = decode(UInt(32), value);
    const secret = makeSecret();
    const secrethash = getSecrethash(secret);

    const { state, config } = await depsMock.latest$.pipe(first()).toPromise();

    const expiration = bigNumberify(state.blockNumber + config.revealTimeout * 2) as UInt<32>;
    const lock = {
      secrethash,
      amount,
      expiration,
    };
    const unsigned: LockedTransfer = {
      type: MessageType.LOCKED_TRANSFER,
      payment_identifier: makePaymentId(),
      message_identifier: makeMessageId(),
      chain_id: bigNumberify(depsMock.network.chainId) as UInt<32>,
      token,
      token_network_address: tokenNetwork,
      recipient: depsMock.address,
      target: partner, // lol
      initiator: partner,
      channel_identifier: bigNumberify(channelId) as UInt<32>,
      metadata: { routes: [{ route: [depsMock.address, partner] }] },
      lock,
      locksroot: getLocksroot([...state.channels[key].partner.locks, lock]),
      nonce: state.channels[key].partner.balanceProof.nonce.add(1) as UInt<8>,
      transferred_amount: Zero as UInt<32>,
      locked_amount: state.channels[key].partner.balanceProof.lockedAmount.add(
        lock.amount,
      ) as UInt<32>,
    };

    const transf = await signMessage(partnerSigner, unsigned, depsMock);
    const received = action$.pipe(first(transferProcessed.is)).toPromise();

    transferGenerateAndSignEnvelopeMessageEpic(
      of(messageReceived({ text: '', message: transf, ts: Date.now() }, { address: partner })),
      state$,
      depsMock,
    ).subscribe((a) => action$.next(a));

    await received;
    if (unlock) {
      // register secret on-chain
      action$.next(
        transferSecretRegister.success(
          { secret, txHash, txBlock: state.blockNumber + 1, confirmed: true },
          { secrethash, direction: Direction.RECEIVED },
        ),
      );
    }
    // return channel state
    return depsMock.latest$
      .pipe(pluck('state', 'channels', channelKey({ tokenNetwork, partner })), first())
      .toPromise();
  }

  afterEach(() => {
    jest.clearAllMocks();
    action$.complete();
    state$.complete();
    depsMock.latest$.complete();
  });

  test('success: receiving a transfer triggers monitoring', async () => {
    expect.assertions(2);

    const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(
      udcDeposit.success(undefined, { totalDeposit: monitoringReward.mul(2) as UInt<32> }),
    );
    const channelState = await receiveTransfer(20);
    const partnerBP = channelState.partner.balanceProof;
    setTimeout(() => action$.complete(), 100);

    await expect(promise).resolves.toEqual(
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
            non_closing_participant: depsMock.address,
            non_closing_signature: expect.any(String),
            monitoring_service_contract_address: expect.any(String),
            reward_amount: monitoringReward,
            signature: expect.any(String),
          },
        },
        { roomName: expect.stringMatching(/_monitoring$/) },
      ),
    );

    expect(signerSpy).toHaveBeenCalledTimes(3);
    signerSpy.mockRestore();
  });

  test('success: token without known rateToSvt gets monitored', async () => {
    expect.assertions(1);

    action$.next(raidenConfigUpdate({ rateToSvt: {} }));

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(
      udcDeposit.success(undefined, { totalDeposit: monitoringReward.mul(2) as UInt<32> }),
    );
    await receiveTransfer(20);
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeDefined();
  });

  test('ignore: not enough udcBalance', async () => {
    expect.assertions(1);

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(
      udcDeposit.success(undefined, { totalDeposit: monitoringReward.sub(1) as UInt<32> }),
    );

    await receiveTransfer(10);
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();
  });

  test('ignore: config.monitoringReward unset', async () => {
    expect.assertions(1);
    action$.next(raidenConfigUpdate({ monitoringReward: null }));

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(
      udcDeposit.success(undefined, { totalDeposit: monitoringReward.mul(2) as UInt<32> }),
    );

    await receiveTransfer(10);
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();
  });

  test('ignore: signing rejected not fatal', async () => {
    expect.assertions(2);

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(
      udcDeposit.success(undefined, { totalDeposit: monitoringReward.mul(2) as UInt<32> }),
    );

    // fails only after transfer's signatures
    const originalSign = depsMock.signer.signMessage;
    const signerSpy = jest
      .spyOn(depsMock.signer, 'signMessage')
      .mockImplementation(async (message) => {
        if (signerSpy.mock.calls.length > 1) throw new Error('Signature rejected');
        return originalSign.call(depsMock.signer, message);
      });

    await receiveTransfer(10);
    setTimeout(() => action$.complete(), 100);

    await expect(promise).resolves.toBeUndefined();

    expect(signerSpy).toHaveBeenCalledTimes(2);
    signerSpy.mockRestore();
  });

  test('ignore: non economically viable channels', async () => {
    expect.assertions(1);

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(
      udcDeposit.success(undefined, { totalDeposit: monitoringReward.mul(2) as UInt<32> }),
    );

    // transfer <= monitoringReward isn't worth to be monitored
    await receiveTransfer(monitoringReward.toNumber());
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();
  });

  test('ignore: non unlocked amount', async () => {
    expect.assertions(1);

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(
      udcDeposit.success(undefined, { totalDeposit: monitoringReward.mul(2) as UInt<32> }),
    );

    // transfer <= monitoringReward isn't worth to be monitored
    await receiveTransfer(20, false);
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();
  });
});

describe('monitorRequestEpic1', () => {
  test('success: receiving a transfer triggers monitoring', async () => {
    expect.assertions(1);
    const [raiden, partner] = await makeRaidens(2);
    const monitoringReward = bigNumberify(5) as UInt<32>;
    const deposit = bigNumberify(500) as UInt<32>;
    const amount = bigNumberify(20) as UInt<32>;

    raiden.store.dispatch(
      raidenConfigUpdate({
        httpTimeout: 30,
        monitoringReward,
        caps: {
          [Capabilities.NO_DELIVERY]: true,
          [Capabilities.NO_MEDIATE]: true,
          // 'noReceive' should be auto-disabled by 'getCaps$'
        },
        // rate=WeiPerEther == 1:1 to SVT
        rateToSvt: { [token]: WeiPerEther as UInt<32> },
      }),
    );
    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([raiden, partner], amount);

    await waitBlock(2);
    const partnerBP = getChannel(raiden, partner).partner.balanceProof;

    expect(raiden.output).toContainEqual(
      messageGlobalSend(
        {
          message: expect.objectContaining({
            type: MessageType.MONITOR_REQUEST,
            /* balance_proof: {
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
            signature: expect.any(String), */
          }),
        },
        { roomName: expect.stringMatching(/_monitoring$/) },
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
        { txHash: depositTx.hash! as Hash, txBlock: expect.any(Number), confirmed: true },
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
