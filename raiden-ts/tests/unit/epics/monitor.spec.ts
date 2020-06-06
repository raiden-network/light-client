/* eslint-disable @typescript-eslint/no-explicit-any */
import { bigNumberify, BigNumberish } from 'ethers/utils';
import { Zero, WeiPerEther } from 'ethers/constants';
import { of } from 'rxjs';
import { first, toArray, pluck } from 'rxjs/operators';

import { Capabilities } from 'raiden-ts/constants';
import { raidenConfigUpdate } from 'raiden-ts/actions';
import { MessageType, LockedTransfer } from 'raiden-ts/messages/types';
import { signMessage, createBalanceHash } from 'raiden-ts/messages/utils';
import { tokenMonitored, channelOpen, channelDeposit, newBlock } from 'raiden-ts/channels/actions';
import { messageReceived, messageGlobalSend } from 'raiden-ts/messages/actions';
import { transferGenerateAndSignEnvelopeMessageEpic } from 'raiden-ts/transfers/epics';
import { UInt, decode } from 'raiden-ts/utils/types';
import {
  makeMessageId,
  makeSecret,
  getSecrethash,
  makePaymentId,
  getLocksroot,
} from 'raiden-ts/transfers/utils';
import { monitorRequestEpic, monitorUdcBalanceEpic } from 'raiden-ts/services/epics';
import { udcDeposited } from 'raiden-ts/services/actions';
import { transferProcessed, transferSecretRegister } from 'raiden-ts/transfers/actions';
import { channelKey } from 'raiden-ts/channels/utils';
import { Direction } from 'raiden-ts/transfers/state';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps } from '../mocks';

test('monitorUdcBalanceEpic', async () => {
  expect.assertions(2);

  const depsMock = raidenEpicDeps();
  const { action$, state$ } = epicFixtures(depsMock);
  const deposit = bigNumberify(23) as UInt<32>;

  depsMock.userDepositContract.functions.effectiveBalance.mockResolvedValue(Zero);

  const promise = monitorUdcBalanceEpic(action$, state$, depsMock).pipe(toArray()).toPromise();

  setTimeout(() => {
    depsMock.userDepositContract.functions.effectiveBalance.mockResolvedValueOnce(deposit);
    action$.next(newBlock({ blockNumber: 2 }));
  }, 10);
  setTimeout(() => action$.complete(), 50);

  await expect(promise).resolves.toEqual([udcDeposited(Zero as UInt<32>), udcDeposited(deposit)]);
  expect(depsMock.userDepositContract.functions.effectiveBalance).toHaveBeenCalledTimes(2);
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
    action$.next(udcDeposited(monitoringReward.mul(2) as UInt<32>));
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
              balance_hash: createBalanceHash(
                partnerBP.transferredAmount,
                partnerBP.lockedAmount,
                partnerBP.locksroot,
              ),
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

  test('ignore: not enough udcBalance', async () => {
    expect.assertions(1);

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(udcDeposited(monitoringReward.sub(1) as UInt<32>));

    await receiveTransfer(10);
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();
  });

  test('ignore: config.monitoringReward unset', async () => {
    expect.assertions(1);
    action$.next(raidenConfigUpdate({ monitoringReward: null }));

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(udcDeposited(monitoringReward.mul(2) as UInt<32>));

    await receiveTransfer(10);
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();
  });

  test('ignore: signing rejected not fatal', async () => {
    expect.assertions(2);

    const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(udcDeposited(monitoringReward.mul(2) as UInt<32>));

    await receiveTransfer(10);

    // to reject AFTER receiveTransfer signed Processed
    signerSpy.mockRejectedValueOnce(new Error('Signature rejected'));
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();

    expect(signerSpy).toHaveBeenCalledTimes(2);
    signerSpy.mockRestore();
  });

  test('ignore: non economically viable channels', async () => {
    expect.assertions(1);

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(udcDeposited(monitoringReward.mul(2) as UInt<32>));

    // transfer <= monitoringReward isn't worth to be monitored
    await receiveTransfer(monitoringReward.toNumber());
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();
  });

  test('ignore: non unlocked amount', async () => {
    expect.assertions(1);

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(udcDeposited(monitoringReward.mul(2) as UInt<32>));

    // transfer <= monitoringReward isn't worth to be monitored
    await receiveTransfer(20, false);
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();
  });

  test('ignore: token without known rateToSvt', async () => {
    expect.assertions(1);

    action$.next(raidenConfigUpdate({ rateToSvt: {} }));

    const promise = monitorRequestEpic(action$, state$, depsMock).toPromise();
    action$.next(udcDeposited(monitoringReward.mul(2) as UInt<32>));

    // transfer <= monitoringReward isn't worth to be monitored
    await receiveTransfer(20);
    setTimeout(() => action$.complete(), 50);

    await expect(promise).resolves.toBeUndefined();
  });
});
