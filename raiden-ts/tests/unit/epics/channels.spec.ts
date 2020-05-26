import { makeLog, makeRaidens, makeHash, waitBlock, makeTransaction } from '../mocks';
import {
  token,
  tokenNetwork,
  id,
  openBlock,
  closeBlock,
  settleBlock,
  settleTimeout,
  txHash,
  ensureChannelIsClosed,
  ensureChannelIsOpen,
  ensureTokenIsMonitored,
  deposit,
  confirmationBlocks,
  ensureChannelIsDeposited,
  ensureTransferReceivedUnlocked,
  ensureTransferReceivedPending,
  secrethash,
  secret,
  ensureChannelIsSettled,
} from '../fixtures';

import { bigNumberify, BigNumber } from 'ethers/utils';
import { Zero, HashZero } from 'ethers/constants';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';

import { UInt } from 'raiden-ts/utils/types';
import {
  channelMonitor,
  channelOpen,
  channelDeposit,
  channelClose,
  channelSettleable,
  channelSettle,
  channelWithdrawn,
} from 'raiden-ts/channels/actions';
import { channelKey, channelUniqueKey } from 'raiden-ts/channels/utils';
import { ChannelState } from 'raiden-ts/channels';
import { TokenNetwork } from 'raiden-ts/contracts/TokenNetwork';
import { Filter } from 'ethers/providers';

test('channelSettleableEpic', async () => {
  expect.assertions(3);

  const [raiden, partner] = await makeRaidens(2);
  await ensureChannelIsClosed([raiden, partner]);

  const key = channelKey({ tokenNetwork, partner });

  await waitBlock(closeBlock + settleTimeout - 1);
  expect(raiden.store.getState().channels[key].state).toBe(ChannelState.closed);

  await waitBlock(closeBlock + settleTimeout + 7);
  expect(raiden.store.getState().channels[key].state).toBe(ChannelState.settleable);
  expect(raiden.output).toContainEqual(
    channelSettleable(
      { settleableBlock: closeBlock + settleTimeout + 7 },
      { tokenNetwork, partner: partner.address },
    ),
  );
});

describe('channelOpenEpic', () => {
  test('fails if channel exists', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);

    raiden.store.dispatch(
      channelOpen.request({ settleTimeout }, { tokenNetwork, partner: partner.address }),
    );
    expect(raiden.store.getState().channels[channelKey({ tokenNetwork, partner })].state).toBe(
      ChannelState.open,
    );
    expect(raiden.output).toContainEqual(
      channelOpen.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('tx fails', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    await ensureTokenIsMonitored(raiden);

    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    const openTx = makeTransaction(0);
    tokenNetworkContract.functions.openChannel.mockResolvedValue(openTx);

    await waitBlock(openBlock);
    raiden.store.dispatch(
      channelOpen.request({ settleTimeout }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();
    expect(tokenNetworkContract.functions.openChannel).toHaveBeenCalled();
    expect(raiden.output).toContainEqual(
      channelOpen.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('success', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    await ensureTokenIsMonitored(raiden);

    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    const openTx = makeTransaction();
    tokenNetworkContract.functions.openChannel.mockResolvedValue(openTx);

    raiden.store.dispatch(
      channelOpen.request({ settleTimeout }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    // result is undefined on success as the respective channelOpen.success is emitted by the
    // tokenMonitoredEpic, which monitors the blockchain for ChannelOpened events
    expect(tokenNetworkContract.functions.openChannel).toHaveBeenCalledTimes(1);
    expect(openTx.wait).toHaveBeenCalledTimes(1);
  });
});

test('channelOpenedEpic', async () => {
  expect.assertions(1);

  const [raiden, partner] = await makeRaidens(2);
  await ensureChannelIsOpen([raiden, partner]);

  expect(raiden.output).toContainEqual(
    channelMonitor(
      { id, fromBlock: expect.any(Number) },
      { tokenNetwork, partner: partner.address },
    ),
  );
});

describe('channelMonitoredEpic', () => {
  const idEncoded = defaultAbiCoder.encode(['uint256'], [id]);
  const depositEncoded = defaultAbiCoder.encode(['uint256'], [deposit]);

  function getMonitoredFilter(tokenNetworkContract: TokenNetwork): Filter {
    return {
      address: tokenNetworkContract.address,
      topics: [
        [
          tokenNetworkContract.interface.events.ChannelNewDeposit.topic,
          tokenNetworkContract.interface.events.ChannelWithdraw.topic,
          tokenNetworkContract.interface.events.ChannelClosed.topic,
          tokenNetworkContract.interface.events.ChannelSettled.topic,
        ],
        [idEncoded],
      ],
    };
  }

  test('initial monitor with past$ own ChannelNewDeposit event', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    raiden.deps.provider.getLogs.mockResolvedValue([
      makeLog({
        blockNumber: openBlock + 1,
        filter: tokenNetworkContract.filters.ChannelNewDeposit(id, raiden.address, null),
        data: depositEncoded, // non-indexed total_deposit = 1023 goes in data
      }),
    ]);
    await ensureChannelIsOpen([raiden, partner]);
    raiden.store.dispatch(
      channelMonitor({ id, fromBlock: openBlock }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelDeposit.success(
        {
          id,
          participant: raiden.address,
          totalDeposit: deposit,
          txHash: expect.any(String),
          txBlock: openBlock + 1,
          confirmed: undefined,
        },
        { tokenNetwork, partner: partner.address },
      ),
    );
  });

  test('already monitored with new$ partner ChannelNewDeposit event', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsOpen([raiden, partner]);
    raiden.store.dispatch(
      channelMonitor({ id, fromBlock: openBlock }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock(openBlock + 2);
    raiden.deps.provider.emit(
      getMonitoredFilter(tokenNetworkContract),
      makeLog({
        blockNumber: openBlock + 2,
        filter: tokenNetworkContract.filters.ChannelNewDeposit(id, partner.address, null),
        data: depositEncoded, // non-indexed total_deposit = 1023 goes in data
      }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelDeposit.success(
        {
          id,
          participant: partner.address,
          totalDeposit: deposit,
          txHash: expect.any(String),
          txBlock: openBlock + 2,
          confirmed: undefined,
        },
        { tokenNetwork, partner: partner.address },
      ),
    );
  });

  test('new$ partner ChannelWithdraw event', async () => {
    expect.assertions(1);
    const withdraw = bigNumberify(300) as UInt<32>;
    const withdrawEncoded = defaultAbiCoder.encode(['uint256'], [withdraw]);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsOpen([raiden, partner]);
    raiden.store.dispatch(
      channelMonitor({ id, fromBlock: openBlock }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock(closeBlock - 1);
    raiden.deps.provider.emit(
      getMonitoredFilter(tokenNetworkContract),
      makeLog({
        blockNumber: closeBlock - 1,
        transactionHash: txHash,
        filter: tokenNetworkContract.filters.ChannelWithdraw(id, partner.address, null),
        data: withdrawEncoded, // non-indexed totalWithdraw
      }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelWithdrawn(
        {
          id,
          participant: partner.address,
          totalWithdraw: withdraw,
          txHash,
          txBlock: closeBlock - 1,
          confirmed: undefined,
        },
        { tokenNetwork, partner: partner.address },
      ),
    );
  });

  test('new$ partner ChannelClosed event', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsOpen([raiden, partner]);
    raiden.store.dispatch(
      channelMonitor({ id, fromBlock: openBlock }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock(closeBlock);
    raiden.deps.provider.emit(
      getMonitoredFilter(tokenNetworkContract),
      makeLog({
        blockNumber: closeBlock,
        transactionHash: txHash,
        filter: tokenNetworkContract.filters.ChannelClosed(id, partner.address, 11, null),
        data: HashZero, // non-indexed balance_hash
      }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelClose.success(
        {
          id,
          participant: partner.address,
          txHash,
          txBlock: closeBlock,
          confirmed: undefined,
        },
        { tokenNetwork, partner: partner.address },
      ),
    );
    expect(raiden.store.getState().channels[channelKey({ tokenNetwork, partner })].state).toBe(
      ChannelState.closing,
    );
  });

  test('new$ ChannelSettled event', async () => {
    expect.assertions(9);
    const settleDataEncoded = defaultAbiCoder.encode(
      ['uint256', 'bytes32', 'uint256', 'bytes32'],
      [Zero, HashZero, Zero, HashZero],
    );

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsClosed([raiden, partner]);
    raiden.store.dispatch(
      channelMonitor({ id, fromBlock: openBlock }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock(settleBlock);

    const filter = getMonitoredFilter(tokenNetworkContract);
    expect(raiden.deps.provider.on).toHaveBeenCalledWith(filter, expect.any(Function));
    expect(raiden.deps.provider.removeListener).not.toHaveBeenCalledWith(
      filter,
      expect.any(Function),
    );
    expect(raiden.deps.provider.listenerCount(filter)).toBe(1);

    const settleHash = makeHash();
    raiden.deps.provider.emit(
      filter,
      makeLog({
        blockNumber: settleBlock,
        transactionHash: settleHash,
        filter: tokenNetworkContract.filters.ChannelSettled(id, null, null, null, null),
        data: settleDataEncoded, // participants amounts aren't indexed, so they go in data
      }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelSettle.success(
        { id, txHash: settleHash, txBlock: settleBlock, confirmed: undefined, locks: [] },
        { tokenNetwork, partner: partner.address },
      ),
    );

    await waitBlock(settleBlock + 2 * confirmationBlocks);
    expect(raiden.output).toContainEqual(
      channelSettle.success(
        { id, txHash: settleHash, txBlock: expect.any(Number), confirmed: true, locks: [] },
        { tokenNetwork, partner: partner.address },
      ),
    );

    // ensure ChannelSettledAction completed channel monitoring and unsubscribed from events
    expect(raiden.deps.provider.removeListener).toHaveBeenCalledWith(filter, expect.any(Function));
    expect(raiden.deps.provider.listenerCount(filter)).toBe(0);

    // ensure channel state is moved from 'channels' to 'oldChannels'
    expect(channelKey({ tokenNetwork, partner }) in raiden.store.getState().channels).toBe(false);
    expect(
      channelUniqueKey({ id, tokenNetwork, partner }) in raiden.store.getState().oldChannels,
    ).toBe(true);
  });
});

describe('channelDepositEpic', () => {
  test('fails if channel.state !== "open" or missing', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    raiden.store.dispatch(
      channelDeposit.request({ deposit }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelDeposit.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('approve tx fails', async () => {
    expect.assertions(3);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);

    const tokenContract = raiden.deps.getTokenContract(token);
    const approveTx = makeTransaction(0);
    tokenContract.functions.approve.mockResolvedValue(approveTx);

    raiden.store.dispatch(
      channelDeposit.request({ deposit }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelDeposit.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
    expect(tokenContract.functions.approve).toHaveBeenCalledTimes(1);
    expect(tokenContract.functions.approve).toHaveBeenCalledWith(tokenNetwork, deposit);
  });

  test('setTotalDeposit tx fails', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);

    const tokenContract = raiden.deps.getTokenContract(token);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    const approveTx = makeTransaction();
    tokenContract.functions.approve.mockResolvedValue(approveTx);

    const setTotalDepositTx = makeTransaction(0);
    tokenNetworkContract.functions.setTotalDeposit.mockResolvedValue(setTotalDepositTx);

    raiden.store.dispatch(
      channelDeposit.request({ deposit }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelDeposit.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('success', async () => {
    expect.assertions(6);

    const prevDeposit = bigNumberify(330) as UInt<32>;
    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner], prevDeposit);

    const tokenContract = raiden.deps.getTokenContract(token);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    const approveTx = makeTransaction();
    tokenContract.functions.approve.mockResolvedValue(approveTx);

    const setTotalDepositTx = makeTransaction();
    tokenNetworkContract.functions.setTotalDeposit.mockResolvedValue(setTotalDepositTx);
    tokenNetworkContract.functions.getChannelParticipantInfo.mockResolvedValue([
      prevDeposit,
      Zero,
      true,
      '',
      Zero,
      '',
      Zero,
    ]);

    raiden.store.dispatch(
      channelDeposit.request({ deposit }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    // result is undefined on success as the respective channelDeposit.success is emitted by the
    // channelMonitoredEpic, which monitors the blockchain for ChannelNewDeposit events
    expect(raiden.output).not.toContainEqual(
      channelDeposit.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
    expect(tokenContract.functions.approve).toHaveBeenCalledTimes(1);
    expect(approveTx.wait).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.functions.setTotalDeposit).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.functions.setTotalDeposit).toHaveBeenCalledWith(
      id,
      raiden.address,
      deposit.add(prevDeposit),
      partner.address,
    );
    expect(setTotalDepositTx.wait).toHaveBeenCalledTimes(1);
  });
});

describe('channelCloseEpic', () => {
  test('fails if there is no open channel with partner on tokenNetwork', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureTokenIsMonitored(raiden);

    raiden.store.dispatch(
      channelClose.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    expect(raiden.output).toContainEqual(
      channelClose.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('fails if channel.state !== "open"|"closing"', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsClosed([raiden, partner]);

    raiden.store.dispatch(
      channelClose.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    expect(raiden.output).toContainEqual(
      channelClose.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('closeChannel tx fails', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    const closeTx = makeTransaction(0);
    tokenNetworkContract.functions.closeChannel.mockResolvedValue(closeTx);

    raiden.store.dispatch(
      channelClose.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();
    expect(raiden.output).toContainEqual(
      channelClose.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('success', async () => {
    expect.assertions(4);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    const closeTx = makeTransaction();
    tokenNetworkContract.functions.closeChannel.mockResolvedValue(closeTx);

    raiden.store.dispatch(
      channelClose.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    // result is undefined on success as the respective channelClose.success is emitted by the
    // channelMonitoredEpic, which monitors the blockchain for channel events
    expect(raiden.output).not.toContainEqual(
      channelClose.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );

    expect(tokenNetworkContract.functions.closeChannel).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.functions.closeChannel).toHaveBeenCalledWith(
      id,
      partner.address,
      raiden.address,
      expect.any(String), // balance_hash
      expect.any(BigNumber), // nonce
      expect.any(String), // additional_hash
      expect.any(String), // non_closing_signature
      expect.any(String), // closing_signature
    );
    expect(closeTx.wait).toHaveBeenCalledTimes(1);
  });
});

test('channelUpdateEpic', async () => {
  expect.assertions(1);

  const [raiden, partner] = await makeRaidens(2);
  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

  await ensureChannelIsOpen([raiden, partner]);
  await ensureTransferReceivedUnlocked([raiden, partner]);
  await ensureChannelIsClosed([partner, raiden]); // partner closes
  await waitBlock();
  await waitBlock();

  expect(tokenNetworkContract.functions.updateNonClosingBalanceProof).toHaveBeenCalledTimes(1);
});

describe('channelSettleEpic', () => {
  test('fails if there is no channel with partner on tokenNetwork', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureTokenIsMonitored(raiden);

    raiden.store.dispatch(
      channelSettle.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    expect(raiden.output).toContainEqual(
      channelSettle.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('fails if channel.state !== "settleable|settling"', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsClosed([raiden, partner]);

    raiden.store.dispatch(
      channelSettle.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    expect(raiden.output).toContainEqual(
      channelSettle.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('settleChannel tx fails', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsClosed([raiden, partner]);
    await waitBlock(settleBlock);

    const settleTx = makeTransaction(0);
    tokenNetworkContract.functions.settleChannel.mockResolvedValue(settleTx);

    raiden.store.dispatch(
      channelSettle.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();
    expect(raiden.output).toContainEqual(
      channelSettle.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('success', async () => {
    expect.assertions(6);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsClosed([raiden, partner]);
    await waitBlock(settleBlock + confirmationBlocks + 1);

    const settleTx = makeTransaction();
    tokenNetworkContract.functions.settleChannel.mockResolvedValue(settleTx);

    raiden.store.dispatch(
      channelSettle.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    await ensureChannelIsSettled([raiden, partner]);
    await waitBlock();

    // result is undefined on success as the respective channelSettle.success is emitted by the
    // channelMonitoredEpic, which monitors the blockchain for channel events
    expect(raiden.output).not.toContainEqual(
      channelSettle.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
    expect(
      raiden.store.getState().channels[channelKey({ tokenNetwork, partner })],
    ).toBeUndefined();
    expect(
      raiden.store.getState().oldChannels[channelUniqueKey({ tokenNetwork, partner, id })],
    ).toBeDefined();

    expect(tokenNetworkContract.functions.settleChannel).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.functions.settleChannel).toHaveBeenCalledWith(
      id,
      raiden.address,
      Zero, // self transfered amount
      Zero, // self locked amount
      HashZero, // self locksroot
      partner.address,
      Zero, // partner transfered amount
      Zero, // partner locked amount
      HashZero, // partner locksroot
    );
    expect(settleTx.wait).toHaveBeenCalledTimes(1);
  });
});

describe('channelUnlockEpic', () => {
  test('tx fails', async () => {
    expect.assertions(2);
    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsOpen([raiden, partner]);
    await ensureTransferReceivedPending([raiden, partner]);

    raiden.deps.provider.emit(
      secretRegistryContract.filters.SecretRevealed(null, null),
      makeLog({
        blockNumber: raiden.deps.provider.blockNumber + 1,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
        data: defaultAbiCoder.encode(['bytes32'], [secret]),
      }),
    );
    await waitBlock();
    await ensureChannelIsClosed([raiden, partner]); // partner closes
    tokenNetworkContract.functions.unlock.mockResolvedValue(makeTransaction(0));

    await waitBlock(settleBlock);
    await ensureChannelIsSettled([raiden, partner]);

    expect(tokenNetworkContract.functions.unlock).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.functions.unlock).toHaveBeenCalledWith(
      id,
      raiden.address,
      partner.address,
      expect.any(Uint8Array),
    );
  });

  test('success', async () => {
    expect.assertions(2);
    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsOpen([raiden, partner]);
    await ensureTransferReceivedPending([raiden, partner]);

    raiden.deps.provider.emit(
      secretRegistryContract.filters.SecretRevealed(null, null),
      makeLog({
        blockNumber: raiden.deps.provider.blockNumber + 1,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
        data: defaultAbiCoder.encode(['bytes32'], [secret]),
      }),
    );
    await waitBlock();
    await ensureChannelIsSettled([raiden, partner]);

    expect(tokenNetworkContract.functions.unlock).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.functions.unlock).toHaveBeenCalledWith(
      id,
      raiden.address,
      partner.address,
      expect.any(Uint8Array),
    );
  });
});
