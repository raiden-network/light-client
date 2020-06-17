/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeLog, makeRaiden, makeAddress, waitBlock } from '../mocks';
import {
  token,
  tokenNetwork,
  id,
  openBlock,
  settleTimeout,
  isFirstParticipant,
  confirmationBlocks,
  txHash,
} from '../fixtures';

import { defaultAbiCoder } from 'ethers/utils/abi-coder';

import { raidenShutdown } from 'raiden-ts/actions';
import { newBlock, tokenMonitored, channelMonitor, channelOpen } from 'raiden-ts/channels/actions';
import { ShutdownReason } from 'raiden-ts/constants';
import { RaidenError, ErrorCodes } from 'raiden-ts/utils/error';

const partner = makeAddress();

describe('raiden init epics', () => {
  test('init newBlock', async () => {
    expect.assertions(2);
    const raiden = await makeRaiden(undefined, false);
    expect(raiden.output).toHaveLength(0);
    await raiden.start();
    expect(raiden.output).toContainEqual(newBlock({ blockNumber: expect.any(Number) }));
  });

  test('init previous tokenMonitored', async () => {
    expect.assertions(2);
    const raiden = await makeRaiden(undefined, false);
    // change initial state before starting
    raiden.store.dispatch(tokenMonitored({ token, tokenNetwork }));
    expect(raiden.store.getState().tokens).toEqual({ [token]: tokenNetwork });
    await raiden.start();
    await waitBlock();
    expect(raiden.output).toContainEqual(tokenMonitored({ token, tokenNetwork }));
  });

  test('init tokenMonitored with scanned tokenNetwork', async () => {
    expect.assertions(3);
    const raiden = await makeRaiden(undefined, false);
    const { registryContract } = raiden.deps;
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    const otherToken = makeAddress();
    const otherTokenNetwork = makeAddress();

    raiden.deps.provider.getLogs.mockImplementation(async ({ address, topics }) => {
      if (address === registryContract.address) {
        // on registryContract's getLogs, return 2 registered tokenNetworks
        return [
          makeLog({ filter: registryContract.filters.TokenNetworkCreated(token, tokenNetwork) }),
          makeLog({
            filter: registryContract.filters.TokenNetworkCreated(otherToken, otherTokenNetwork),
          }),
        ];
      } else if (
        address === tokenNetwork &&
        topics?.[3] === defaultAbiCoder.encode(['address'], [raiden.address])
      ) {
        // on tokenNetwork ChannelOpened getLogs, return a channel (network of interest)
        return [
          makeLog({
            filter: tokenNetworkContract.filters.ChannelOpened(
              id,
              raiden.address,
              raiden.address,
              null,
            ),
          }),
        ];
      }
      return [];
    });
    await raiden.start();
    await waitBlock();

    expect(raiden.output).toContainEqual(
      tokenMonitored({ token, tokenNetwork, fromBlock: expect.any(Number) }),
    );
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

    expect(raiden.output).toContainEqual(channelMonitor({ id }, meta));
  });

  test('ShutdownReason.ACCOUNT_CHANGED', async () => {
    expect.assertions(2);

    const raiden = await makeRaiden(undefined, false);
    // first, address is present, therefore it's a provider account
    raiden.deps.provider.listAccounts.mockResolvedValue([raiden.address]);
    await raiden.start();

    // account is gone from listAccounts, so not available anymore
    raiden.deps.provider.listAccounts.mockResolvedValue([]);
    await raiden.deps.latest$.toPromise(); // raidenShutdown completes subjects

    expect(raiden.started).toBe(false);
    expect(raiden.output[raiden.output.length - 1]).toEqual(
      raidenShutdown({ reason: ShutdownReason.ACCOUNT_CHANGED }),
    );
  });

  test('ShutdownReason.ACCOUNT_CHANGED', async () => {
    expect.assertions(2);

    const raiden = await makeRaiden();

    // change network at runtime
    raiden.deps.provider.getNetwork.mockResolvedValue({ chainId: 899, name: 'unknown' });
    await raiden.deps.latest$.toPromise(); // raidenShutdown completes subjects

    expect(raiden.started).toBe(false);
    expect(raiden.output[raiden.output.length - 1]).toEqual(
      raidenShutdown({ reason: ShutdownReason.NETWORK_CHANGED }),
    );
  });

  test('unexpected unrecoverable exception triggers shutdown', async () => {
    expect.assertions(2);

    const raiden = await makeRaiden();

    // change network at runtime
    const error = new RaidenError(ErrorCodes.RDN_GENERAL_ERROR);
    raiden.deps.provider.listAccounts.mockRejectedValue(error);
    await raiden.deps.latest$.toPromise(); // raidenShutdown completes subjects

    expect(raiden.started).toBe(false);
    expect(raiden.output[raiden.output.length - 1]).toEqual(raidenShutdown({ reason: error }));
  });
});

describe('tokenMonitoredEpic', () => {
  const settleTimeoutEncoded = defaultAbiCoder.encode(['uint256'], [settleTimeout]);

  test('first tokenMonitored with past$ ChannelOpened event', async () => {
    expect.assertions(1);

    const raiden = await makeRaiden();
    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    raiden.deps.provider.getLogs.mockImplementation(async ({ address, topics }) => {
      if (
        address === tokenNetwork &&
        topics?.[0] === tokenNetworkContract.interface.events.ChannelOpened.topic
      )
        return [
          makeLog({
            transactionHash: txHash,
            blockNumber: openBlock,
            filter: tokenNetworkContract.filters.ChannelOpened(id, partner, raiden.address, null),
            data: settleTimeoutEncoded,
          }),
        ];
      return [];
    });

    raiden.store.dispatch(
      tokenMonitored({
        token,
        tokenNetwork,
        fromBlock: 2,
      }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
      channelOpen.success(
        {
          id,
          token,
          settleTimeout,
          isFirstParticipant: false,
          txHash,
          txBlock: openBlock,
          confirmed: undefined,
        },
        { tokenNetwork, partner },
      ),
    );
  });

  test('already tokenMonitored with new$ ChannelOpened event', async () => {
    expect.assertions(1);

    const raiden = await makeRaiden(undefined, false);
    raiden.store.dispatch(tokenMonitored({ token, tokenNetwork }));
    await raiden.start();

    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    raiden.deps.provider.emit(
      tokenNetworkContract.filters.ChannelOpened(null, null, null, null),
      makeLog({
        transactionHash: txHash,
        blockNumber: openBlock,
        filter: tokenNetworkContract.filters.ChannelOpened(id, raiden.address, partner, null),
        data: settleTimeoutEncoded,
      }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
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
        { tokenNetwork, partner },
      ),
    );
  });

  test("ensure multiple tokenMonitored don't produce duplicated events", async () => {
    expect.assertions(2);

    const raiden = await makeRaiden();
    for (let i = 0; i < 16; i++) raiden.store.dispatch(tokenMonitored({ token, tokenNetwork }));

    const tokenNetworkContract = raiden.deps.getTokenNetworkContract(tokenNetwork);

    raiden.deps.provider.emit(
      tokenNetworkContract.filters.ChannelOpened(null, null, null, null),
      makeLog({
        transactionHash: txHash,
        blockNumber: openBlock,
        filter: tokenNetworkContract.filters.ChannelOpened(id, raiden.address, partner, null),
        data: settleTimeoutEncoded,
      }),
    );
    await waitBlock();

    expect(raiden.output).toContainEqual(
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
        { tokenNetwork, partner },
      ),
    );
    expect(
      raiden.output.filter(
        (action) => channelOpen.success.is(action) && action.payload.confirmed === undefined,
      ),
    ).toHaveLength(1);
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
