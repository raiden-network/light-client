/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  amount,
  confirmationBlocks,
  deposit,
  ensureChannelIsDeposited,
  ensureTransferPending,
  ensureTransferUnlocked,
  id,
  isFirstParticipant,
  openBlock,
  settleTimeout,
  token,
  tokenNetwork,
  txHash,
} from './fixtures';
import { makeLog, makeRaiden, makeRaidens, sleep, waitBlock } from './mocks';

import { defaultAbiCoder } from '@ethersproject/abi';
import { HashZero, One } from '@ethersproject/constants';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { first } from 'rxjs/operators';

import { raidenShutdown, raidenSynced } from '@/actions';
import { channelMonitored, channelOpen, newBlock, tokenMonitored } from '@/channels/actions';
import { ShutdownReason } from '@/constants';
import { getTransfers } from '@/db/utils';
import { Direction } from '@/transfers/state';
import { makeSecret } from '@/transfers/utils';
import { ErrorCodes, RaidenError } from '@/utils/error';
import type { UInt } from '@/utils/types';
import { last } from '@/utils/types';

import { makeAddress } from '../utils';

const partner = makeAddress();

describe('raiden init epics', () => {
  test('init newBlock', async () => {
    expect.assertions(2);
    const raiden = await makeRaiden(undefined, false);
    expect(raiden.output).toHaveLength(0);
    await raiden.start();
    expect(raiden.output).toContainEqual(newBlock({ blockNumber: expect.any(Number) }));
  });

  test('init tokenMonitored with scanned tokenNetwork, retry and wait synced', async () => {
    expect.assertions(4);
    const raiden = await makeRaiden(undefined, false);
    const { registryContract } = raiden.deps;
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    const otherToken = makeAddress();
    const otherTokenNetwork = makeAddress();

    // first, register some random tokenNetworks, so the later can be scanned
    for (let i = 0; i < 5; i++) {
      raiden.deps.provider.emit(
        {},
        makeLog({
          blockNumber: 65 + i,
          filter: registryContract.filters.TokenNetworkCreated(makeAddress(), makeAddress()),
          data: defaultAbiCoder.encode(['uint256'], [settleTimeout]),
        }),
      );
    }
    // on registryContract's getLogs, return 2 registered tokenNetworks
    raiden.deps.provider.emit(
      {},
      makeLog({
        blockNumber: 71,
        filter: registryContract.filters.TokenNetworkCreated(token, tokenNetwork),
        data: defaultAbiCoder.encode(['uint256'], [settleTimeout]),
      }),
    );
    raiden.deps.provider.emit(
      {},
      makeLog({
        blockNumber: 72,
        filter: registryContract.filters.TokenNetworkCreated(otherToken, otherTokenNetwork),
        data: defaultAbiCoder.encode(['uint256'], [settleTimeout]),
      }),
    );
    // on tokenNetwork ChannelOpened getLogs, return a channel (network of interest)
    raiden.deps.provider.emit(
      {},
      makeLog({
        blockNumber: 73,
        filter: tokenNetworkContract.filters.ChannelOpened(id, raiden.address, raiden.address),
      }),
    );

    // ensure one getLogs error doesn't fail and is retried by retryAsync$
    raiden.deps.provider.getLogs.mockRejectedValueOnce(new Error('invalid response'));
    const promise = firstValueFrom(raiden.action$.pipe(first(tokenMonitored.is)));

    await raiden.start();
    await sleep();
    // since we put some delay on retryAsync$, we need to wait
    await promise;

    expect(raiden.output).toContainEqual(
      tokenMonitored({ token, tokenNetwork, fromBlock: expect.any(Number) }),
    );
    expect(raiden.output).toContainEqual(raidenSynced(expect.anything()));
    // output shouldn't contain anything about otherTokenNetwork; not of interest
    expect(raiden.output).not.toContainEqual(
      tokenMonitored(expect.objectContaining({ token: otherToken })),
    );
    expect(raiden.output).not.toContainEqual(
      tokenMonitored(expect.objectContaining({ tokenNetwork: otherTokenNetwork })),
    );
  });

  test('init previous channelMonitored', async () => {
    expect.assertions(1);
    const raiden = await makeRaiden(undefined, false);
    // change initial state before starting
    raiden.store.dispatch(tokenMonitored({ token, tokenNetwork }));
    const meta = { tokenNetwork, partner };
    raiden.store.dispatch(
      channelOpen.success(
        {
          id,
          isFirstParticipant,
          token,
          txHash,
          txBlock: openBlock,
          confirmed: true,
        },
        meta,
      ),
    );
    await raiden.start();

    expect(raiden.output).toContainEqual(channelMonitored({ id }, meta));
  });

  test('ShutdownReason.ACCOUNT_CHANGED', async () => {
    expect.assertions(2);

    const raiden = await makeRaiden(undefined, false);
    // first, address is present, therefore it's a provider account
    raiden.deps.provider.listAccounts.mockResolvedValue([raiden.address]);
    await raiden.start();
    await sleep();

    // account is gone from listAccounts, so not available anymore
    raiden.deps.provider.listAccounts.mockResolvedValue([]);
    await lastValueFrom(raiden.deps.latest$); // raidenShutdown completes subjects

    expect(raiden.started).toBe(false);
    expect(last(raiden.output)).toEqual(
      raidenShutdown({ reason: ShutdownReason.ACCOUNT_CHANGED }),
    );
  });

  test('ShutdownReason.NETWORK_CHANGED', async () => {
    expect.assertions(2);

    const raiden = await makeRaiden();

    // change network at runtime
    raiden.deps.provider.detectNetwork.mockResolvedValue({ chainId: 899, name: 'unknown' });
    await lastValueFrom(raiden.deps.latest$); // raidenShutdown completes subjects

    expect(raiden.started).toBe(false);
    expect(last(raiden.output)).toEqual(
      raidenShutdown({ reason: ShutdownReason.NETWORK_CHANGED }),
    );
  });

  test('unexpected unrecoverable exception triggers shutdown', async () => {
    expect.assertions(2);

    const raiden = await makeRaiden();
    const error = new RaidenError(ErrorCodes.RDN_GENERAL_ERROR);
    raiden.deps.provider.getNetwork.mockRejectedValue(error);
    await lastValueFrom(raiden.deps.latest$); // raidenShutdown completes subjects

    expect(raiden.started).toBe(false);
    expect(last(raiden.output)).toEqual(raidenShutdown({ reason: error }));
  });
});

describe('confirmationEpic', () => {
  test('confirmed', async () => {
    expect.assertions(2);

    const raiden = await makeRaiden();
    const meta = { tokenNetwork, partner };

    raiden.deps.provider.getTransactionReceipt.mockResolvedValueOnce(null as any);

    raiden.store.dispatch(
      channelOpen.success(
        {
          id,
          token,
          isFirstParticipant: true,
          txHash,
          txBlock: openBlock,
          confirmed: undefined,
        },
        meta,
      ),
    );
    await waitBlock(openBlock + confirmationBlocks + 2);
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelOpen.success(
        expect.objectContaining({
          id,
          txHash,
          txBlock: openBlock,
          confirmed: true,
        }),
        meta,
      ),
    );
    expect(raiden.deps.provider.getTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  test('removed', async () => {
    expect.assertions(3);

    const raiden = await makeRaiden();
    const meta = { tokenNetwork, partner };

    // no confirmations: tx is removed
    raiden.deps.provider.getTransactionReceipt.mockResolvedValue({
      to: tokenNetwork,
      from: raiden.address,
      contractAddress: tokenNetwork,
      transactionIndex: 1,
      gasUsed: One,
      cumulativeGasUsed: One,
      effectiveGasPrice: One,
      logsBloom: '',
      blockHash: HashZero,
      logs: [],
      confirmations: 0,
      transactionHash: txHash,
      byzantium: true,
      blockNumber: openBlock,
      type: 0,
    });
    raiden.deps.provider.getTransactionReceipt.mockResolvedValueOnce(null as any);

    raiden.store.dispatch(
      channelOpen.success(
        {
          id,
          token,
          isFirstParticipant: true,
          txHash,
          txBlock: openBlock,
          confirmed: undefined,
        },
        meta,
      ),
    );
    await waitBlock(openBlock + confirmationBlocks + 2);
    expect(raiden.output).not.toContainEqual(
      channelOpen.success(
        expect.objectContaining(expect.objectContaining({ confirmed: expect.any(Boolean) })),
        meta,
      ),
    );
    await waitBlock(openBlock + 2 * confirmationBlocks + 2);

    expect(raiden.output).toContainEqual(
      channelOpen.success(
        expect.objectContaining({
          id,
          txHash,
          txBlock: openBlock,
          confirmed: false,
        }),
        meta,
      ),
    );
    expect(raiden.deps.provider.getTransactionReceipt).toHaveBeenCalledTimes(2);
  });
});

test('getTransfers', async () => {
  expect.assertions(10);

  const [raiden, partner] = await makeRaidens(2);

  await ensureChannelIsDeposited([raiden, partner], deposit);
  await ensureChannelIsDeposited([partner, raiden], deposit);
  const secret = makeSecret();
  await ensureTransferUnlocked([raiden, partner], amount.mul(2) as UInt<32>, { secret });
  await ensureTransferPending([partner, raiden], amount);
  await sleep();

  await expect(getTransfers(raiden.deps.db)).resolves.toHaveLength(2);
  await expect(
    getTransfers(raiden.deps.db, undefined, { offset: 1, limit: 1, desc: true }),
  ).resolves.toEqual([expect.objectContaining({ direction: Direction.SENT, secret })]);
  await expect(getTransfers(raiden.deps.db, { pending: true })).resolves.toHaveLength(1);
  await expect(getTransfers(raiden.deps.db, { pending: false })).resolves.toHaveLength(1);

  await expect(getTransfers(raiden.deps.db, { token })).resolves.toHaveLength(2);
  await expect(getTransfers(raiden.deps.db, { token: tokenNetwork })).resolves.toHaveLength(0);
  await expect(
    getTransfers(raiden.deps.db, { token, partner: partner.address }),
  ).resolves.toHaveLength(2);
  await expect(
    getTransfers(raiden.deps.db, { token, partner: raiden.address }),
  ).resolves.toHaveLength(0);
  await expect(getTransfers(raiden.deps.db, { token, end: raiden.address })).resolves.toHaveLength(
    2,
  );
  await expect(getTransfers(raiden.deps.db, { token, end: tokenNetwork })).resolves.toHaveLength(
    0,
  );
});
