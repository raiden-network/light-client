import {
  amount,
  closeBlock,
  confirmationBlocks,
  deposit,
  ensureChannelIsClosed,
  ensureChannelIsDeposited,
  ensureChannelIsOpen,
  ensureChannelIsSettled,
  ensureTokenIsMonitored,
  ensureTransferPending,
  ensureTransferUnlocked,
  getChannel,
  getOrWaitTransfer,
  id,
  openBlock,
  secret,
  secrethash,
  settleBlock,
  settleTimeout,
  token,
  tokenNetwork,
  txHash,
} from './fixtures';
import {
  makeLog,
  makeRaiden,
  makeRaidens,
  makeTransaction,
  providersEmit,
  sleep,
  waitBlock,
} from './mocks';

import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { hexlify } from '@ethersproject/bytes';
import { AddressZero, HashZero, Zero } from '@ethersproject/constants';
import { firstValueFrom } from 'rxjs';
import { filter, first, pluck } from 'rxjs/operators';

import { raidenConfigUpdate } from '@/actions';
import { ChannelState } from '@/channels';
import {
  channelClose,
  channelDeposit,
  channelMonitored,
  channelOpen,
  channelSettle,
  channelSettleable,
  channelWithdrawn,
  tokenMonitored,
} from '@/channels/actions';
import { channelKey, channelUniqueKey } from '@/channels/utils';
import { Capabilities, LocksrootZero } from '@/constants';
import { createBalanceHash, getBalanceProofFromEnvelopeMessage } from '@/messages';
import { Direction } from '@/transfers/state';
import { getLocksroot, transferKey } from '@/transfers/utils';
import { ErrorCodes } from '@/utils/error';
import type { UInt } from '@/utils/types';

import { makeAddress, makeHash } from '../utils';

test('channelSettleableEpic', async () => {
  expect.assertions(3);

  const [raiden, partner] = await makeRaidens(2);

  const closeBlockPromise = firstValueFrom(
    raiden.action$.pipe(filter(channelClose.success.is), pluck('payload', 'txBlock')),
  );
  await ensureChannelIsClosed([raiden, partner]);

  const closeBlock = await closeBlockPromise;
  const closeTs = (await firstValueFrom(raiden.deps.getBlockTimestamp(closeBlock))) * 1e3;
  const settleTs = closeTs + settleTimeout * 1e3;

  await sleep(settleTs - Date.now() - 10e3); // 10s before becoming settleable
  expect(getChannel(raiden, partner).state).toBe(ChannelState.closed);

  await sleep(20e3); // +20s, after settleable
  expect(getChannel(raiden, partner).state).toBe(ChannelState.settleable);

  expect(raiden.output).toContainEqual(
    channelSettleable(
      { settleableBlock: expect.any(Number) },
      { tokenNetwork, partner: partner.address },
    ),
  );
}, 10e3);

describe('channelOpenEpic', () => {
  test('fails if channel exists', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);

    raiden.store.dispatch(channelOpen.request({}, { tokenNetwork, partner: partner.address }));
    expect(getChannel(raiden, partner).state).toBe(ChannelState.open);
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
    tokenNetworkContract.openChannel.mockResolvedValue(openTx);

    await waitBlock(openBlock);
    raiden.store.dispatch(channelOpen.request({}, { tokenNetwork, partner: partner.address }));
    await waitBlock();
    expect(tokenNetworkContract.openChannel).toHaveBeenCalled();
    expect(raiden.output).toContainEqual(
      channelOpen.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('success!', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    await ensureTokenIsMonitored(raiden);

    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    const openTx = makeTransaction();
    tokenNetworkContract.openChannel.mockResolvedValue(openTx);

    raiden.store.dispatch(channelOpen.request({}, { tokenNetwork, partner: partner.address }));
    await waitBlock();

    // result is undefined on success as the respective channelOpen.success is emitted by the
    // tokenMonitoredEpic, which monitors the blockchain for ChannelOpened events
    expect(tokenNetworkContract.openChannel).toHaveBeenCalledTimes(1);
    expect(openTx.wait).toHaveBeenCalledTimes(1);
  });

  test('success with deposit', async () => {
    expect.assertions(3);

    const [raiden, partner] = await makeRaidens(2);
    const token = makeAddress();
    const tokenNetwork = makeAddress();
    await ensureTokenIsMonitored(raiden, [token, tokenNetwork]);

    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    const openTx = makeTransaction();
    tokenNetworkContract.openChannelWithDeposit.mockResolvedValue(openTx);
    const meta = { tokenNetwork, partner: partner.address };

    raiden.store.dispatch(channelOpen.request({ deposit }, meta));
    await waitBlock();

    // result is undefined on success as the respective channelOpen.success is emitted by the
    // tokenMonitoredEpic, which monitors the blockchain for ChannelOpened events
    expect(tokenNetworkContract.openChannelWithDeposit).toHaveBeenCalledTimes(1);
    expect(openTx.wait).toHaveBeenCalledTimes(1);
    expect(raiden.output).toContainEqual(
      channelDeposit.request({ totalDeposit: deposit, waitOpen: true }, meta),
    );
  });

  test('success race deposited while partner opened', async () => {
    expect.assertions(4);

    const [raiden, partner] = await makeRaidens(2);
    const token = makeAddress();
    const tokenNetwork = makeAddress();
    await ensureTokenIsMonitored(raiden, [token, tokenNetwork]);

    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    tokenNetworkContract.openChannelWithDeposit.mockRejectedValue(new Error('transaction failed'));

    const openTx = makeTransaction();
    const partnerTokenNetworkContract = partner.deps.getTokenNetworkContract(tokenNetwork);
    partnerTokenNetworkContract.openChannelWithDeposit.mockResolvedValue(openTx);

    raiden.store.dispatch(
      channelOpen.request({ deposit }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    // still retrying
    expect(raiden.output).not.toContainEqual(
      channelOpen.success(expect.anything(), expect.anything()),
    );
    expect(raiden.output).not.toContainEqual(
      channelOpen.failure(expect.anything(), expect.anything()),
    );
    expect(raiden.output).not.toContainEqual(
      channelDeposit.success(expect.anything(), expect.anything()),
    );
    // partner opens channel with us while we were retrying
    await ensureChannelIsOpen([partner, raiden], { tokens: [token, tokenNetwork] });
    await waitBlock();

    // when channelOpen.success is picked, we must channelDeposit.request due to the race
    expect(raiden.output).toContainEqual(
      channelDeposit.request(
        { totalDeposit: deposit, waitOpen: true },
        { tokenNetwork, partner: partner.address },
      ),
    );
  });
});

test('channelMonitoredEpic', async () => {
  expect.assertions(1);

  const [raiden, partner] = await makeRaidens(2);
  await ensureChannelIsOpen([raiden, partner]);

  expect(raiden.output).toContainEqual(
    channelMonitored({ id }, { tokenNetwork, partner: partner.address }),
  );
});

describe('channelEventsEpic', () => {
  const depositEncoded = defaultAbiCoder.encode(['uint256'], [deposit]);

  test('initial monitor with past$ own ChannelNewDeposit event', async () => {
    expect.assertions(2);
    const settleTimeoutEncoded = defaultAbiCoder.encode(['uint256'], [settleTimeout]);

    const partner = makeAddress();
    const raiden = await makeRaiden(undefined, false);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    // put a previous channel in state, to trigger logs to be fetched since it
    raiden.store.dispatch(
      channelOpen.success(
        {
          id: id - 1,
          token,
          isFirstParticipant: true,
          txHash: makeHash(),
          txBlock: openBlock - 4,
          confirmed: true,
        },
        { tokenNetwork, partner: makeAddress() },
      ),
    );
    await raiden.start();
    await waitBlock(openBlock);

    await providersEmit(
      {},
      makeLog({
        blockNumber: openBlock,
        filter: tokenNetworkContract.filters.ChannelOpened(id, raiden.address, partner),
        data: settleTimeoutEncoded, // non-indexed settleTimeout goes in data
      }),
    );
    // getLogs for our address as 2nd participant returns no event
    await providersEmit(
      {},
      makeLog({
        blockNumber: openBlock + 1,
        filter: tokenNetworkContract.filters.ChannelNewDeposit(id, raiden.address, null),
        data: depositEncoded, // non-indexed total_deposit = 1023 goes in data
      }),
    );
    await waitBlock(openBlock + confirmationBlocks + 3);
    raiden.store.dispatch(tokenMonitored({ token, tokenNetwork, fromBlock: openBlock - 5 }));
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelDeposit.success(
        {
          id,
          participant: raiden.address,
          totalDeposit: deposit,
          txHash: expect.any(String),
          txBlock: openBlock + 1,
          confirmed: true,
        },
        { tokenNetwork, partner },
      ),
    );
    // expect getLogs to have been limited fromBlock
    expect(raiden.deps.provider.send).toHaveBeenCalledWith('eth_getLogs', [
      {
        address: tokenNetwork,
        topics: [
          expect.arrayContaining([
            Interface.getEventTopic(tokenNetworkContract.interface.getEvent('ChannelNewDeposit')),
            Interface.getEventTopic(tokenNetworkContract.interface.getEvent('ChannelSettled')),
          ]),
          // ensure already confirmed channel also got into scanned channelIds set
          expect.arrayContaining(
            [id - 1, id].map((i) => defaultAbiCoder.encode(['uint256'], [i])),
          ),
        ],
        fromBlock: hexlify(openBlock - 5),
        toBlock: expect.any(String),
      },
    ]);
  });

  test('already monitored with new$ partner ChannelNewDeposit event', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsOpen([raiden, partner]);
    await waitBlock(openBlock + 2);

    await sleep();
    const blockNumber = raiden.deps.provider.blockNumber;
    await providersEmit(
      {},
      makeLog({
        blockNumber,
        filter: tokenNetworkContract.filters.ChannelNewDeposit(id, partner.address, null),
        data: depositEncoded, // non-indexed total_deposit = 1000 goes in data
      }),
    );
    await waitBlock();
    await waitBlock(blockNumber + raiden.config.confirmationBlocks);
    await expect(
      firstValueFrom(
        raiden.deps.latest$.pipe(
          pluck('state', 'channels', channelKey({ tokenNetwork, partner }), 'partner', 'deposit'),
          first((deposit) => deposit.gt(0)),
        ),
      ),
    ).resolves.toEqual(deposit);

    expect(raiden.output).toContainEqual(
      channelDeposit.success(
        {
          id,
          participant: partner.address,
          totalDeposit: deposit,
          txHash: expect.any(String),
          txBlock: blockNumber,
          confirmed: true,
        },
        { tokenNetwork, partner: partner.address },
      ),
    );
  });

  test('new$ partner ChannelWithdraw event', async () => {
    expect.assertions(2);
    const withdraw = BigNumber.from(300) as UInt<32>;
    const withdrawEncoded = defaultAbiCoder.encode(['uint256'], [withdraw]);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsOpen([raiden, partner]);
    const blockNumber = raiden.deps.provider.blockNumber;
    raiden.deps.provider.emit(
      {},
      makeLog({
        blockNumber,
        transactionHash: txHash,
        filter: tokenNetworkContract.filters.ChannelWithdraw(id, partner.address, null),
        data: withdrawEncoded, // non-indexed totalWithdraw
      }),
    );
    await waitBlock();
    await waitBlock(blockNumber + raiden.config.confirmationBlocks);
    await expect(
      firstValueFrom(
        raiden.deps.latest$.pipe(
          pluck('state', 'channels', channelKey({ tokenNetwork, partner }), 'partner', 'withdraw'),
          first((withdraw) => withdraw.gt(0)),
        ),
      ),
    ).resolves.toEqual(withdraw);

    expect(raiden.output).toContainEqual(
      channelWithdrawn(
        {
          id,
          participant: partner.address,
          totalWithdraw: withdraw,
          txHash,
          txBlock: blockNumber,
          confirmed: true,
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
    await waitBlock(closeBlock);
    raiden.deps.provider.emit(
      {},
      makeLog({
        blockNumber: closeBlock,
        transactionHash: txHash,
        filter: tokenNetworkContract.filters.ChannelClosed(id, partner.address, 11, null),
        data: HashZero, // non-indexed balance_hash
      }),
    );
    await waitBlock();
    await waitBlock(closeBlock + raiden.config.confirmationBlocks);
    await firstValueFrom(
      raiden.deps.latest$.pipe(
        pluck('state', 'channels', channelKey({ tokenNetwork, partner }), 'state'),
        first((state) => state === ChannelState.closed),
      ),
    );

    expect(raiden.output).toContainEqual(
      channelClose.success(
        {
          id,
          participant: partner.address,
          txHash,
          txBlock: closeBlock,
          confirmed: true,
        },
        { tokenNetwork, partner: partner.address },
      ),
    );
    expect(getChannel(raiden, partner).state).toBe(ChannelState.closed);
  });

  test('new$ ChannelSettled event', async () => {
    expect.assertions(5);
    const settleDataEncoded = defaultAbiCoder.encode(
      ['address', 'uint256', 'bytes32', 'address', 'uint256', 'bytes32'],
      [AddressZero, Zero, HashZero, AddressZero, Zero, HashZero],
    );

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    await ensureChannelIsClosed([raiden, partner]);

    await waitBlock(settleBlock);
    const settleHash = makeHash();
    await providersEmit(
      {},
      makeLog({
        blockNumber: settleBlock,
        transactionHash: settleHash,
        filter: tokenNetworkContract.filters.ChannelSettled(id),
        data: settleDataEncoded, // participants amounts aren't indexed, so they go in data
      }),
    );
    await waitBlock();
    await sleep(2 * raiden.config.pollingInterval);

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

    // ensure TokenNetwork is still being monitored after settle
    expect(raiden.deps.provider.removeListener).not.toHaveBeenCalled();

    // ensure channel state is moved from 'channels' to 'oldChannels'
    expect(getChannel(raiden, partner)).toBeUndefined();
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

  test('fails if not enough balance', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);

    const tokenContract = raiden.deps.getTokenContract(token);
    tokenContract.balanceOf.mockResolvedValue(deposit.sub(1));

    raiden.store.dispatch(
      channelDeposit.request({ deposit }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelDeposit.failure(
        expect.objectContaining({ message: ErrorCodes.RDN_INSUFFICIENT_BALANCE }),
        { tokenNetwork, partner: partner.address },
      ),
    );
  });

  test('approve tx fails with resetAllowance needed', async () => {
    expect.assertions(4);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);

    const tokenContract = raiden.deps.getTokenContract(token);
    // not enough allowance, but not zero, need to reset
    tokenContract.allowance.mockResolvedValue(deposit.sub(1));

    tokenContract.approve.mockResolvedValue(makeTransaction(0));
    // resetAllowance$ succeeds, but then actual approve fails
    tokenContract.approve.mockResolvedValueOnce(makeTransaction());

    raiden.store.dispatch(
      channelDeposit.request({ deposit }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelDeposit.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
    expect(tokenContract.approve).toHaveBeenCalledTimes(2);
    expect(tokenContract.approve).toHaveBeenCalledWith(tokenNetwork, 0, expect.anything());
    expect(tokenContract.approve).toHaveBeenCalledWith(
      tokenNetwork,
      raiden.config.minimumAllowance,
      expect.anything(),
    );
  });

  test('setTotalDeposit tx fails', async () => {
    expect.assertions(1);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);

    const tokenContract = raiden.deps.getTokenContract(token);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    const approveTx = makeTransaction();
    tokenContract.approve.mockResolvedValue(approveTx);

    const setTotalDepositTx = makeTransaction(0);
    tokenNetworkContract.setTotalDeposit.mockResolvedValue(setTotalDepositTx);

    raiden.store.dispatch(
      channelDeposit.request({ deposit }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelDeposit.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('success!', async () => {
    expect.assertions(6);

    const prevDeposit = BigNumber.from(330) as UInt<32>;
    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsDeposited([raiden, partner], prevDeposit);

    const tokenContract = raiden.deps.getTokenContract(token);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    const approveTx = makeTransaction();
    tokenContract.approve.mockResolvedValue(approveTx);
    // first approve tx fail with nonce error, replacement fee error should be retried
    const approveFailTx: typeof approveTx = makeTransaction(undefined, {
      wait: jest.fn().mockRejectedValue(new Error('replacement fee too low')),
    });
    tokenContract.approve.mockResolvedValueOnce(approveFailTx);

    const setTotalDepositTx = makeTransaction();
    tokenNetworkContract.setTotalDeposit.mockResolvedValue(setTotalDepositTx);

    raiden.store.dispatch(
      channelDeposit.request({ deposit }, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();
    // give some time for the `approve` retry
    await sleep(raiden.deps.provider.pollingInterval * 2);

    // result is undefined on success as the respective channelDeposit.success is emitted by the
    // channelMonitoredEpic, which monitors the blockchain for ChannelNewDeposit events
    expect(raiden.output).not.toContainEqual(
      channelDeposit.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
    expect(tokenContract.approve).toHaveBeenCalledTimes(2);
    expect(approveTx.wait).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.setTotalDeposit).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.setTotalDeposit).toHaveBeenCalledWith(
      id,
      raiden.address,
      deposit.add(prevDeposit),
      partner.address,
      expect.anything(),
    );
    expect(setTotalDepositTx.wait).toHaveBeenCalledTimes(1);
  });

  test('success totalDeposit waitOpen', async () => {
    expect.assertions(6);

    const [raiden, partner] = await makeRaidens(2);

    raiden.store.dispatch(raidenConfigUpdate({ minimumAllowance: Zero as UInt<32> }));
    const tokenContract = raiden.deps.getTokenContract(token);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    await Promise.all([ensureTokenIsMonitored(raiden), ensureTokenIsMonitored(partner)]);

    raiden.store.dispatch(
      channelDeposit.request(
        { totalDeposit: deposit, waitOpen: true },
        { tokenNetwork, partner: partner.address },
      ),
    );
    await waitBlock();
    expect(tokenNetworkContract.setTotalDeposit).not.toHaveBeenCalled();
    expect(tokenContract.approve).toHaveBeenCalledTimes(1);
    expect(tokenContract.approve).toHaveBeenCalledWith(tokenNetwork, deposit, expect.anything());

    await ensureChannelIsOpen([raiden, partner], { channelId: 29 });
    await waitBlock();

    // result is undefined on success as the respective channelDeposit.success is emitted by the
    // channelMonitoredEpic, which monitors the blockchain for ChannelNewDeposit events
    expect(raiden.output).not.toContainEqual(
      channelDeposit.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
    expect(tokenNetworkContract.setTotalDeposit).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.setTotalDeposit).toHaveBeenCalledWith(
      29,
      raiden.address,
      deposit,
      partner.address,
      expect.anything(),
    );
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
    tokenNetworkContract.closeChannel.mockResolvedValue(closeTx);

    raiden.store.dispatch(
      channelClose.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();
    expect(raiden.output).toContainEqual(
      channelClose.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('success', async () => {
    expect.assertions(5);

    const [raiden, partner] = await makeRaidens(2);
    await ensureChannelIsOpen([raiden, partner]);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    const closeTx = makeTransaction();
    tokenNetworkContract.closeChannel.mockResolvedValue(closeTx);

    raiden.store.dispatch(
      channelClose.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();

    // result is undefined on success as the respective channelClose.success is emitted by the
    // channelMonitoredEpic, which monitors the blockchain for channel events
    expect(raiden.output).not.toContainEqual(
      channelClose.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );

    expect(tokenNetworkContract.closeChannel).toHaveBeenCalledTimes(1);
    const nonce = getChannel(raiden, partner).partner.balanceProof.nonce;
    // debugger;
    expect(nonce).toBeBigNumber();
    expect(tokenNetworkContract.closeChannel).toHaveBeenCalledWith(
      id,
      partner.address,
      raiden.address,
      expect.any(String), // balance_hash
      expect.toBeBigNumber(0), // nonce
      expect.any(String), // additional_hash
      expect.any(String), // non_closing_signature
      expect.any(String), // closing_signature
      expect.anything(),
    );
    expect(closeTx.wait).toHaveBeenCalledTimes(1);
  });
});

test('channelUpdateEpic', async () => {
  expect.assertions(1);

  const [raiden, partner] = await makeRaidens(2);
  const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

  await ensureChannelIsOpen([raiden, partner]);
  await ensureTransferUnlocked([partner, raiden]);
  await ensureChannelIsClosed([partner, raiden]); // partner closes
  await waitBlock();
  await waitBlock();

  expect(tokenNetworkContract.updateNonClosingBalanceProof).toHaveBeenCalledTimes(1);
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
    await waitBlock(settleBlock + confirmationBlocks + 1);

    const settleTx = makeTransaction(0);
    tokenNetworkContract.settleChannel.mockResolvedValue(settleTx);

    raiden.store.dispatch(
      channelSettle.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    await waitBlock();
    expect(raiden.output).toContainEqual(
      channelSettle.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
  });

  test('success!', async () => {
    expect.assertions(6);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    // despite we doing a transfer, leave default getChannelParticipantInfo mock which will
    // tell we closed with BalanceProofZero, and should still work
    await ensureTransferUnlocked([raiden, partner], amount);
    await ensureChannelIsClosed([raiden, partner]);
    await waitBlock(settleBlock + confirmationBlocks + 1);

    const settleTx = makeTransaction();
    tokenNetworkContract.settleChannel.mockResolvedValue(settleTx);

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
    expect(getChannel(raiden, partner)).toBeUndefined();
    expect(
      raiden.store.getState().oldChannels[channelUniqueKey({ tokenNetwork, partner, id })],
    ).toBeDefined();

    expect(tokenNetworkContract.settleChannel).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.settleChannel).toHaveBeenCalledWith(
      id,
      raiden.address,
      Zero, // self transfered amount
      Zero, // self locked amount
      LocksrootZero, // self locksroot
      partner.address,
      Zero, // partner transfered amount
      Zero, // partner locked amount
      LocksrootZero, // partner locksroot
      expect.anything(),
    );
    expect(settleTx.wait).toHaveBeenCalledTimes(1);
  }, 10e3);

  test('success with own outdated balanceHash', async () => {
    expect.assertions(8);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    raiden.store.dispatch(raidenConfigUpdate({ autoSettle: true }));

    // deposit and make a transfer to partner
    await ensureTransferUnlocked([raiden, partner], amount);
    await ensureChannelIsClosed([partner, raiden]); // partner closes channel

    // LockedTransfer message we sent, not one before latest BP
    const locked = (
      await getOrWaitTransfer(partner, { direction: Direction.RECEIVED, secrethash })
    ).transfer;
    // ensure our latest own BP is the unlocked one, the one after Locked
    expect(getChannel(raiden, partner).own.balanceProof.nonce).toEqual(locked.nonce.add(1));

    // lets mock getChannelParticipantInfo to look like partner closed with BP from locked state
    // instead of current/latest one, which is unlocked
    const settleTx = makeTransaction();
    const settled = new Promise((resolve) => {
      tokenNetworkContract.settleChannel.mockImplementation(async () => {
        ensureChannelIsSettled([raiden, partner]).then(resolve);
        return settleTx;
      });
    });
    tokenNetworkContract.getChannelParticipantInfo.mockImplementation(
      async ({}, participant, {}) => {
        // from our perspective, partner closed the channel with wrong balanceProof
        if (participant === raiden.address)
          return [
            Zero,
            Zero,
            false,
            createBalanceHash(getBalanceProofFromEnvelopeMessage(locked)),
            locked.nonce,
            locked.locksroot,
            locked.locked_amount,
          ];
        else return [Zero, Zero, true, HashZero, Zero, HashZero, Zero];
      },
    );

    await waitBlock(settleBlock + 1);
    await waitBlock(settleBlock + raiden.config.revealTimeout + 2);
    await waitBlock();
    await settled;

    // result is undefined on success as the respective channelSettle.success is emitted by the
    // channelMonitoredEpic, which monitors the blockchain for channel events
    expect(raiden.output).not.toContainEqual(
      channelSettle.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
    expect(getChannel(raiden, partner)).toBeUndefined();
    expect(
      raiden.store.getState().oldChannels[channelUniqueKey({ tokenNetwork, partner, id })],
    ).toBeDefined();

    expect(tokenNetworkContract.settleChannel).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.settleChannel).toHaveBeenCalledWith(
      id,
      partner.address,
      Zero, // partner transfered amount
      Zero, // partner locked amount
      LocksrootZero, // partner locksroot
      raiden.address,
      Zero, // self transfered amount
      amount, // self locked amount
      getLocksroot([locked.lock]), // self locksroot
      expect.anything(),
    );
    expect(settleTx.wait).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.getChannelParticipantInfo).toHaveBeenCalledTimes(2);
  });

  test('success with partner outdated balanceHash', async () => {
    expect.assertions(8);

    const [raiden, partner] = await makeRaidens(2);
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);
    raiden.store.dispatch(raidenConfigUpdate({ autoSettle: true }));

    // deposit and make a transfer to partner
    await ensureTransferUnlocked([partner, raiden], amount);
    await ensureChannelIsClosed([partner, raiden]); // partner closes channel

    // LockedTransfer message we received, not one before latest BP
    const locked = (
      await getOrWaitTransfer(raiden, transferKey({ direction: Direction.RECEIVED, secrethash }))
    ).transfer;
    // ensure our latest partner BP is the unlocked one, the one after Locked
    expect(getChannel(raiden, partner).partner.balanceProof.nonce).toEqual(locked.nonce.add(1));

    // lets mock getChannelParticipantInfo to look like partner closed with BP from locked state
    // instead of current/latest one, which is unlocked
    const settleTx = makeTransaction();
    const settled = new Promise((resolve, reject) => {
      tokenNetworkContract.settleChannel.mockImplementation(async () => {
        ensureChannelIsSettled([raiden, partner]).then(resolve, reject);
        return settleTx;
      });
    });
    tokenNetworkContract.getChannelParticipantInfo.mockImplementation(
      async ({}, participant, {}) => {
        // from our perspective, partner closed the channel with wrong balanceProof
        if (participant === partner.address)
          return [
            Zero,
            Zero,
            false,
            createBalanceHash(getBalanceProofFromEnvelopeMessage(locked)),
            locked.nonce,
            locked.locksroot,
            locked.locked_amount,
          ];
        else return [Zero, Zero, true, HashZero, Zero, HashZero, Zero];
      },
    );

    await waitBlock(settleBlock + 1);
    await waitBlock(settleBlock + raiden.config.revealTimeout + 2);
    await waitBlock();
    await settled;

    // result is undefined on success as the respective channelSettle.success is emitted by the
    // channelMonitoredEpic, which monitors the blockchain for channel events
    expect(raiden.output).not.toContainEqual(
      channelSettle.failure(expect.any(Error), { tokenNetwork, partner: partner.address }),
    );
    expect(getChannel(raiden, partner)).toBeUndefined();
    expect(
      raiden.store.getState().oldChannels[channelUniqueKey({ tokenNetwork, partner, id })],
    ).toBeDefined();

    expect(tokenNetworkContract.settleChannel).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.settleChannel).toHaveBeenCalledWith(
      id,
      raiden.address,
      Zero, // self transfered amount
      Zero, // self locked amount
      LocksrootZero, // self locksroot
      partner.address,
      Zero, // partner transfered amount
      amount, // partner locked amount
      getLocksroot([locked.lock]), // partner locksroot
      expect.anything(),
    );
    expect(settleTx.wait).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.getChannelParticipantInfo).toHaveBeenCalledTimes(2);
  });
});

describe('channelUnlockEpic', () => {
  test('tx fails', async () => {
    expect.assertions(2);
    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsOpen([raiden, partner]);
    await ensureTransferPending([partner, raiden]);
    partner.stop(); // ensure partner doesn't unlock

    await providersEmit(
      {},
      makeLog({
        blockNumber: raiden.deps.provider.blockNumber + 1,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash, null),
        data: secret,
      }),
    );
    await waitBlock();
    await ensureChannelIsClosed([raiden, partner]);
    tokenNetworkContract.unlock.mockResolvedValue(makeTransaction(0));

    await sleep(settleTimeout * 1e3);
    await ensureChannelIsSettled([raiden, partner]);

    expect(tokenNetworkContract.unlock).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.unlock).toHaveBeenCalledWith(
      id,
      raiden.address,
      partner.address,
      expect.any(Uint8Array),
      expect.anything(),
    );
  });

  test('success', async () => {
    expect.assertions(2);
    const [raiden, partner] = await makeRaidens(2);
    const { secretRegistryContract } = raiden.deps;
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    await ensureChannelIsOpen([raiden, partner]);
    await ensureTransferPending([partner, raiden]);
    await partner.stop(); // ensure partner doesn't unlock

    await providersEmit(
      {},
      makeLog({
        blockNumber: raiden.deps.provider.blockNumber + 1,
        filter: secretRegistryContract.filters.SecretRevealed(secrethash),
        data: defaultAbiCoder.encode(['bytes32'], [secret]),
      }),
    );
    await waitBlock();
    await ensureChannelIsSettled([raiden, partner]);

    expect(tokenNetworkContract.unlock).toHaveBeenCalledTimes(1);
    expect(tokenNetworkContract.unlock).toHaveBeenCalledWith(
      id,
      raiden.address,
      partner.address,
      expect.any(Uint8Array),
      expect.anything(),
    );
  });
});

describe('channelAutoSettleEpic', () => {
  test('closing side', async () => {
    expect.assertions(2);

    const [raiden, partner] = await makeRaidens(2);

    // enable autoSettle
    raiden.store.dispatch(raidenConfigUpdate({ autoSettle: true }));

    // we close
    await ensureChannelIsClosed([raiden, partner]);
    await waitBlock(settleBlock + 1);
    await waitBlock(settleBlock + 2 * confirmationBlocks + 1);

    expect(raiden.output).toContainEqual(
      channelSettle.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    expect(getChannel(raiden, partner)?.state).toBe(ChannelState.settling);
  });

  test('non-closing side', async () => {
    expect.assertions(4);

    const [raiden, partner] = await makeRaidens(2);

    // enable autoSettle
    raiden.store.dispatch(raidenConfigUpdate({ autoSettle: true }));

    // partner closes
    const closeBlockPromise = firstValueFrom(
      raiden.action$.pipe(filter(channelClose.success.is), pluck('payload', 'txBlock')),
    );
    await ensureChannelIsClosed([partner, raiden]);
    const closeBlock = await closeBlockPromise;
    const closeTs = await firstValueFrom(raiden.deps.getBlockTimestamp(closeBlock));
    const settleTs = closeTs + settleTimeout;

    await sleep(settleTs * 1e3 - Date.now() + raiden.config.httpTimeout); // settleable
    expect(raiden.output).toContainEqual(
      channelSettleable(
        { settleableBlock: expect.any(Number) },
        { tokenNetwork, partner: partner.address },
      ),
    );
    expect(raiden.output).not.toContainEqual(channelSettle.request(undefined, expect.anything()));

    await sleep(raiden.config.revealTimeout * 1e3);
    expect(raiden.output).toContainEqual(
      channelSettle.request(undefined, { tokenNetwork, partner: partner.address }),
    );
    expect(getChannel(raiden, partner)?.state).toBe(ChannelState.settling);
  }, 10e3);
});

test('stale provider disables receiving', async () => {
  expect.assertions(3);

  const raiden = await makeRaiden(undefined, false);
  raiden.store.dispatch(raidenConfigUpdate({ httpTimeout: 100 }));
  await raiden.start();

  // at first, receiving is enabled (since there's UDC deposit)
  await waitBlock();
  expect(raiden.config.caps?.[Capabilities.RECEIVE]).toBeTruthy();

  // but after some long enough time, it gets auto-disabled because no new blocks went through
  await sleep(4 * 15e3, false);
  expect(raiden.config.caps?.[Capabilities.RECEIVE]).toBe(0);

  // but if a block goes through, it gets re-enabled
  await waitBlock();
  await sleep();
  expect(raiden.config.caps?.[Capabilities.RECEIVE]).toBeTruthy();
});
