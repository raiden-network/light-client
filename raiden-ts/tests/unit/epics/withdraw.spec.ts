/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeRaidens, waitBlock, MockedRaiden } from '../mocks';
import {
  ensureChannelIsDeposited,
  tokenNetwork,
  id,
  deposit,
  amount,
  ensureTransferUnlocked,
  getChannel,
  ensureChannelIsClosed,
} from '../fixtures';

import { bigNumberify } from 'ethers/utils';

import { MessageType, WithdrawRequest } from 'raiden-ts/messages/types';
import { signMessage } from 'raiden-ts/messages/utils';
import { messageSend, messageReceived } from 'raiden-ts/messages/actions';
import { withdrawReceive } from 'raiden-ts/transfers/actions';
import { UInt } from 'raiden-ts/utils/types';
import { makeMessageId } from 'raiden-ts/transfers/utils';
import { channelAmounts } from 'raiden-ts/channels/utils';
import { Zero } from 'ethers/constants';

describe('withdraw receive request', () => {
  async function receiveWithdrawRequest(raiden: MockedRaiden, partner: MockedRaiden) {
    const request: WithdrawRequest = {
      type: MessageType.WITHDRAW_REQUEST,
      message_identifier: makeMessageId(),
      chain_id: bigNumberify(raiden.deps.network.chainId) as UInt<32>,
      token_network_address: tokenNetwork,
      channel_identifier: bigNumberify(id) as UInt<32>,
      participant: partner.address,
      // withdrawable amount is partner.deposit + own.g
      total_withdraw: deposit.add(amount) as UInt<32>,
      nonce: getChannel(partner, raiden).own.nextNonce,
      expiration: bigNumberify(raiden.store.getState().blockNumber + 20) as UInt<32>,
    };
    const message = await signMessage(partner.deps.signer, request);

    raiden.store.dispatch(
      messageReceived({ text: '', message, ts: Date.now() }, { address: partner.address }),
    );
    await waitBlock();
    return message;
  }

  test('success', async () => {
    expect.assertions(4);

    const [raiden, partner] = await makeRaidens(2);

    await ensureChannelIsDeposited([raiden, partner], amount);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([raiden, partner], amount);

    expect(channelAmounts(getChannel(raiden, partner)).partnerCapacity).toEqual(
      deposit.add(amount),
    );

    const ownNextNonce = getChannel(raiden, partner).own.nextNonce;
    const request = await receiveWithdrawRequest(raiden, partner);

    expect(raiden.output).toContainEqual(
      withdrawReceive.request(
        { message: request },
        {
          tokenNetwork,
          partner: partner.address,
          totalWithdraw: request.total_withdraw,
          expiration: request.expiration.toNumber(),
        },
      ),
    );
    expect(raiden.output).toContainEqual(
      messageSend.request(
        {
          message: expect.objectContaining({
            type: MessageType.WITHDRAW_CONFIRMATION,
            nonce: ownNextNonce,
            total_withdraw: deposit.add(amount),
          }),
        },
        { address: partner.address, msgId: expect.any(String) },
      ),
    );
    // partner's capacity is zero, since they withdrew all we had transferred to them
    expect(channelAmounts(getChannel(raiden, partner)).partnerCapacity).toEqual(Zero);
  });

  test('fail: channel not open', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);

    await ensureChannelIsDeposited([raiden, partner], amount);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([raiden, partner], amount);
    await ensureChannelIsClosed([raiden, partner]);

    await receiveWithdrawRequest(raiden, partner);

    // request isn't accepted
    expect(raiden.output).not.toContainEqual(
      withdrawReceive.request(expect.anything(), expect.anything()),
    );
  });

  test('fail: request bigger than deposit', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);

    await ensureChannelIsDeposited([raiden, partner], amount);
    await ensureChannelIsDeposited([partner, raiden], amount); // deposit only amount on partner's
    await ensureTransferUnlocked([raiden, partner], amount);

    await receiveWithdrawRequest(raiden, partner); // try to withdraw deposit+amount

    // request isn't accepted
    expect(raiden.output).not.toContainEqual(
      withdrawReceive.request(expect.anything(), expect.anything()),
    );
  });

  test('accept expired but dont confirm', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);

    await ensureChannelIsDeposited([raiden, partner], amount);
    await ensureChannelIsDeposited([partner, raiden], deposit);
    await ensureTransferUnlocked([raiden, partner], amount);

    const request: WithdrawRequest = {
      type: MessageType.WITHDRAW_REQUEST,
      message_identifier: makeMessageId(),
      chain_id: bigNumberify(raiden.deps.network.chainId) as UInt<32>,
      token_network_address: tokenNetwork,
      channel_identifier: bigNumberify(id) as UInt<32>,
      participant: partner.address,
      // withdrawable amount is partner.deposit + own.g
      total_withdraw: deposit.add(amount) as UInt<32>,
      nonce: getChannel(partner, raiden).own.nextNonce,
      expiration: bigNumberify(raiden.store.getState().blockNumber + 20) as UInt<32>,
    };
    const message = await signMessage(partner.deps.signer, request);

    // expire request
    await waitBlock(request.expiration.toNumber() + 10);

    raiden.store.dispatch(
      messageReceived({ text: '', message, ts: Date.now() }, { address: partner.address }),
    );
    await waitBlock();

    // request is accepted
    expect(raiden.output).toContainEqual(
      withdrawReceive.request(
        { message },
        {
          tokenNetwork,
          partner: partner.address,
          totalWithdraw: request.total_withdraw,
          expiration: request.expiration.toNumber(),
        },
      ),
    );
    // but no confirmation is signed since it's expired
    expect(raiden.output).not.toContainEqual(
      withdrawReceive.success(expect.anything(), expect.anything()),
    );
  });
});
