/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  confirmationBlocks,
  id,
  isFirstParticipant,
  openBlock,
  settleTimeout,
  token,
  tokenNetwork,
  txHash,
} from '../fixtures';
import { makeLog, makeRaiden, waitBlock } from '../mocks';

import { defaultAbiCoder } from '@ethersproject/abi';
import { HashZero, One } from '@ethersproject/constants';
import { first, pluck } from 'rxjs/operators';

import { raidenShutdown, raidenSynced } from '@/actions';
import { channelMonitored, channelOpen, newBlock, tokenMonitored } from '@/channels/actions';
import { ShutdownReason } from '@/constants';
import { ErrorCodes, RaidenError } from '@/utils/error';
import { last } from '@/utils/types';

import { makeAddress, sleep } from '../../utils';

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
        }),
      );
    }
    // on registryContract's getLogs, return 2 registered tokenNetworks
    raiden.deps.provider.emit(
      {},
      makeLog({
        blockNumber: 71,
        filter: registryContract.filters.TokenNetworkCreated(token, tokenNetwork),
      }),
    );
    raiden.deps.provider.emit(
      {},
      makeLog({
        blockNumber: 72,
        filter: registryContract.filters.TokenNetworkCreated(otherToken, otherTokenNetwork),
      }),
    );
    // on tokenNetwork ChannelOpened getLogs, return a channel (network of interest)
    raiden.deps.provider.emit(
      {},
      makeLog({
        blockNumber: 73,
        filter: tokenNetworkContract.filters.ChannelOpened(
          id,
          raiden.address,
          raiden.address,
          null,
        ),
        data: defaultAbiCoder.encode(['uint256'], [settleTimeout]),
      }),
    );

    // ensure one getLogs error doesn't fail and is retried by retryAsync$
    raiden.deps.provider.getLogs.mockRejectedValueOnce(new Error('invalid response'));
    const promise = raiden.deps.latest$
      .pipe(pluck('action'), first(tokenMonitored.is))
      .toPromise();

    await raiden.start();
    await waitBlock();
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
          settleTimeout,
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
    await raiden.deps.latest$.toPromise(); // raidenShutdown completes subjects

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
    await raiden.deps.latest$.toPromise(); // raidenShutdown completes subjects

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
    await raiden.deps.latest$.toPromise(); // raidenShutdown completes subjects

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
          settleTimeout,
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
      logsBloom: '',
      blockHash: HashZero,
      logs: [],
      confirmations: 0,
      transactionHash: txHash,
      byzantium: true,
      blockNumber: openBlock,
    });
    raiden.deps.provider.getTransactionReceipt.mockResolvedValueOnce(null as any);

    raiden.store.dispatch(
      channelOpen.success(
        {
          id,
          token,
          settleTimeout,
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
