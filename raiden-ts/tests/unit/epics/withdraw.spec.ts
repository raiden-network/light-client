/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeRaidens, waitBlock, MockedRaiden, makeTransaction, makeRaiden } from '../mocks';
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

import {
  MessageType,
  WithdrawRequest,
  WithdrawConfirmation,
  Processed,
  WithdrawExpired,
} from 'raiden-ts/messages/types';
import { signMessage } from 'raiden-ts/messages/utils';
import { messageSend, messageReceived } from 'raiden-ts/messages/actions';
import { withdraw, withdrawMessage, withdrawExpire } from 'raiden-ts/transfers/actions';
import { UInt, Hash, Signed } from 'raiden-ts/utils/types';
import { makeMessageId } from 'raiden-ts/transfers/utils';
import { channelAmounts } from 'raiden-ts/channels/utils';
import { Zero } from 'ethers/constants';
import { Direction } from 'raiden-ts/transfers/state';
import { ErrorCodes } from 'raiden-ts/utils/error';

describe('withdraw receive request', () => {
  const direction = Direction.RECEIVED;

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
      withdrawMessage.request(
        { message: request },
        {
          direction,
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
      withdrawMessage.request(expect.anything(), expect.anything()),
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
      withdrawMessage.request(expect.anything(), expect.anything()),
    );
  });
});

describe('withdraw send request', () => {
  const direction = Direction.SENT;

  async function receiveWithdrawConfirmation(raiden: MockedRaiden, partner: MockedRaiden) {
    const req = raiden.output.find(withdrawMessage.request.is)!.payload.message;
    const confirmation: WithdrawConfirmation = {
      type: MessageType.WITHDRAW_CONFIRMATION,
      message_identifier: makeMessageId(),
      chain_id: req.chain_id,
      token_network_address: tokenNetwork,
      channel_identifier: req.channel_identifier,
      participant: raiden.address,
      total_withdraw: req.total_withdraw,
      nonce: getChannel(partner, raiden).own.nextNonce,
      expiration: req.expiration,
    };
    const message = await signMessage(partner.deps.signer, confirmation);

    raiden.store.dispatch(
      messageReceived({ text: '', message, ts: Date.now() }, { address: partner.address }),
    );
    await waitBlock();
    return message;
  }

  test('success!', async () => {
    expect.assertions(9);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], amount);
    await ensureTransferUnlocked([partner, raiden], amount);

    expect(channelAmounts(getChannel(raiden, partner)).ownWithdrawable).toEqual(
      deposit.add(amount),
    );
    const totalWithdraw = deposit.add(amount) as UInt<32>;
    const expiration = raiden.deps.provider.blockNumber + 2 * raiden.config.revealTimeout;
    const nonce = getChannel(raiden, partner).own.nextNonce;
    const meta = {
      direction,
      tokenNetwork,
      partner: partner.address,
      totalWithdraw,
      expiration,
    };

    // perform withdraw request
    raiden.store.dispatch(withdraw.request(undefined, meta));
    await waitBlock();
    expect(raiden.output).toContainEqual(
      withdrawMessage.request(
        { message: expect.objectContaining({ type: MessageType.WITHDRAW_REQUEST, nonce }) },
        meta,
      ),
    );
    const request = raiden.output.find(withdrawMessage.request.is)!.payload.message;
    expect(getChannel(raiden, partner).own.nextNonce).toEqual(nonce.add(1));

    const withdrawTx = makeTransaction();
    tokenNetworkContract.functions.setTotalWithdraw.mockResolvedValue(withdrawTx);

    // receive confirmation
    const partnerNextNonce = getChannel(raiden, partner).partner.nextNonce;
    const confirmation = await receiveWithdrawConfirmation(raiden, partner);

    expect(getChannel(raiden, partner).partner.nextNonce).toEqual(partnerNextNonce.add(1));
    expect(raiden.output).toContainEqual(withdrawMessage.success({ message: confirmation }, meta));
    expect(tokenNetworkContract.functions.setTotalWithdraw).toHaveBeenCalledWith(
      id,
      raiden.address,
      totalWithdraw,
      expiration,
      request.signature,
      confirmation.signature,
    );
    expect(raiden.output).toContainEqual(
      messageSend.request(
        {
          message: expect.objectContaining({
            type: MessageType.PROCESSED,
            message_identifier: confirmation.message_identifier,
          }),
        },
        { address: partner.address, msgId: expect.any(String) },
      ),
    );
    // partner's capacity is zero, since they withdrew all we had transferred to them
    expect(channelAmounts(getChannel(raiden, partner)).ownCapacity).toEqual(Zero);
    expect(raiden.output).toContainEqual(
      withdraw.success(
        {
          txHash: withdrawTx.hash as Hash,
          txBlock: expect.any(Number),
          confirmed: true,
        },
        meta,
      ),
    );
  });

  test('fail: channel not open', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);

    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], amount);
    await ensureTransferUnlocked([partner, raiden], amount);
    await ensureChannelIsClosed([raiden, partner]);

    const totalWithdraw = deposit.add(amount) as UInt<32>;
    const expiration = raiden.deps.provider.blockNumber + 2 * raiden.config.revealTimeout;
    const meta = {
      direction,
      tokenNetwork,
      partner: partner.address,
      totalWithdraw,
      expiration,
    };

    // perform withdraw request
    raiden.store.dispatch(withdraw.request(undefined, meta));
    await waitBlock();

    // request isn't accepted
    expect(raiden.output).not.toContainEqual(
      withdrawMessage.request(expect.anything(), expect.anything()),
    );
    expect(raiden.output).toContainEqual(
      withdraw.failure(
        expect.objectContaining({ message: expect.stringContaining('not open') }),
        meta,
      ),
    );
  });

  test('fail: request bigger than deposit', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);

    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], amount);
    await ensureTransferUnlocked([partner, raiden], amount);

    const totalWithdraw = deposit.add(amount).add(1) as UInt<32>;
    const expiration = raiden.deps.provider.blockNumber + 2 * raiden.config.revealTimeout;
    const meta = {
      direction,
      tokenNetwork,
      partner: partner.address,
      totalWithdraw,
      expiration,
    };

    // perform withdraw request
    raiden.store.dispatch(withdraw.request(undefined, meta));
    await waitBlock();

    // request isn't accepted
    expect(raiden.output).not.toContainEqual(
      withdrawMessage.request(expect.anything(), expect.anything()),
    );
    expect(raiden.output).toContainEqual(
      withdraw.failure(
        expect.objectContaining({ message: ErrorCodes.CNL_WITHDRAW_AMOUNT_TOO_HIGH }),
        meta,
      ),
    );
  });

  test('fail: expires too soon', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);

    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], amount);
    await ensureTransferUnlocked([partner, raiden], amount);

    const totalWithdraw = deposit.add(amount) as UInt<32>;
    const expiration = raiden.deps.provider.blockNumber + 2 * raiden.config.revealTimeout;
    const meta = {
      direction,
      tokenNetwork,
      partner: partner.address,
      totalWithdraw,
      expiration,
    };
    // advance current block to revealTimeout before expiration, already too soon
    await waitBlock(expiration - raiden.config.revealTimeout + 1);

    // perform withdraw request
    raiden.store.dispatch(withdraw.request(undefined, meta));
    await waitBlock();

    // request isn't accepted
    expect(raiden.output).not.toContainEqual(
      withdrawMessage.request(expect.anything(), expect.anything()),
    );
    expect(raiden.output).toContainEqual(
      withdraw.failure(
        expect.objectContaining({ message: expect.stringContaining('expires too soon') }),
        meta,
      ),
    );
  });

  test('skip: already requested', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);

    await ensureChannelIsDeposited([raiden, partner], deposit);
    await ensureChannelIsDeposited([partner, raiden], amount);
    await ensureTransferUnlocked([partner, raiden], amount);

    const totalWithdraw = deposit.add(amount) as UInt<32>;
    const expiration = raiden.deps.provider.blockNumber + 2 * raiden.config.revealTimeout;
    const meta = {
      direction,
      tokenNetwork,
      partner: partner.address,
      totalWithdraw,
      expiration,
    };

    // perform withdraw request
    raiden.store.dispatch(withdraw.request(undefined, meta));
    await waitBlock();
    raiden.store.dispatch(withdraw.request(undefined, meta));
    await waitBlock();

    // output has only one withdrawMessage.request, despite two withdraw.request
    expect(raiden.output.filter(withdrawMessage.request.is)).toEqual([
      withdrawMessage.request(
        { message: expect.objectContaining({ type: MessageType.WITHDRAW_REQUEST }) },
        meta,
      ),
    ]);
    expect(raiden.output).not.toContainEqual(withdraw.failure(expect.anything(), meta));
  });
});

test('withdraw expire', async () => {
  expect.assertions(9);
  let raiden = await makeRaiden();
  const partner = await makeRaiden();

  await ensureChannelIsDeposited([raiden, partner], deposit);
  await ensureChannelIsDeposited([partner, raiden], amount);
  await ensureTransferUnlocked([partner, raiden], amount);

  const totalWithdraw = deposit.add(amount) as UInt<32>;
  const expiration = raiden.deps.provider.blockNumber + 2 * raiden.config.revealTimeout;
  const meta = {
    direction: Direction.SENT,
    tokenNetwork,
    partner: partner.address,
    totalWithdraw,
    expiration,
  };

  // perform withdraw request
  raiden.store.dispatch(withdraw.request(undefined, meta));
  await waitBlock();

  // request is accepted, but not confirmed
  expect(raiden.output).toContainEqual(
    withdrawMessage.request(
      { message: expect.objectContaining({ type: MessageType.WITHDRAW_REQUEST }) },
      meta,
    ),
  );
  const request = raiden.output.find(withdrawMessage.request.is)!.payload.message;
  // receive the request on partner, to persist it in state
  partner.store.dispatch(
    messageReceived({ text: '', ts: 1, message: request }, { address: raiden.address }),
  );

  // advance current block to right after expiration, still unconfirmed
  await waitBlock(expiration + 1);
  expect(raiden.output).not.toContainEqual(
    withdrawExpire.request(expect.anything(), expect.anything()),
  );
  const expiredNonce = getChannel(raiden, partner).own.nextNonce;
  const expectedExpireMessage = expect.objectContaining({
    type: MessageType.WITHDRAW_EXPIRED,
    nonce: expiredNonce,
  });

  // confirm expiration block, request expire
  await waitBlock(expiration + raiden.config.confirmationBlocks + 1);
  expect(raiden.output).toContainEqual(withdrawExpire.request(undefined, meta));
  expect(raiden.output).toContainEqual(
    withdrawExpire.success({ message: expectedExpireMessage }, meta),
  );
  const expired = getChannel(raiden, partner).own.pendingWithdraws.find(
    Signed(WithdrawExpired).is,
  )!;
  expect(expired).toEqual(expectedExpireMessage);
  expect(raiden.output).toContainEqual(
    messageSend.request(
      { message: expired },
      expect.objectContaining({ address: partner.address }),
    ),
  );
  await waitBlock();

  // restart raiden node
  raiden.stop();
  raiden = await makeRaiden(raiden.deps.signer, true, raiden.store.getState());
  await waitBlock();

  expect(raiden.output).toContainEqual(withdrawExpire.success({ message: expired }, meta));
  partner.store.dispatch(
    messageReceived({ text: '', ts: 1, message: expired }, { address: raiden.address }),
  );
  await waitBlock();
  expect(partner.output).toContainEqual(
    messageSend.request(
      {
        message: expect.objectContaining({
          type: MessageType.PROCESSED,
          message_identifier: expired.message_identifier,
        }),
      },
      expect.objectContaining({ address: raiden.address }),
    ),
  );
  const processed = partner.output
    .filter(messageSend.request.is)
    .map((o) => o.payload.message)
    .filter(Signed(Processed).is)
    .find((m) => m.message_identifier.eq(expired.message_identifier))!;

  // confirm expire, clear pending withdraw request and expired messages
  raiden.store.dispatch(
    messageReceived({ text: '', ts: 1, message: processed }, { address: partner.address }),
  );
  expect(getChannel(raiden, partner).own.pendingWithdraws).toEqual([]);
});
