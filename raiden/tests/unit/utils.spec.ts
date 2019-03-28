import { of } from 'rxjs';
import { first, take, toArray } from 'rxjs/operators';

import { Log } from 'ethers/providers/abstract-provider';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';

import { fromEthersEvent, getEventsStream } from 'raiden/utils';
import { raidenEpicDeps } from './mocks';

describe('fromEthersEvent', () => {
  let { provider } = raidenEpicDeps();

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('event registered and emitted', async () => {
    const promise = fromEthersEvent<number>(provider, 'block')
      .pipe(first())
      .toPromise();
    provider.emit('block', 1337);

    const blockNumber = await promise;

    expect(blockNumber).toBe(1337);
    expect(provider.on).toHaveBeenCalledTimes(1);
    expect(provider.removeListener).toHaveBeenCalledTimes(1);
  });
});

describe('getEventsStream', () => {
  let { provider, registryContract } = raidenEpicDeps();

  afterEach(() => {
    jest.clearAllMocks();
  });

  type TokenNetworkCreatedEvent = [string, string, Event];

  test('newEvents$ only', async () => {
    const filter = registryContract.filters.TokenNetworkCreated(null, null);

    const promise = getEventsStream<TokenNetworkCreatedEvent>(registryContract, [filter])
      .pipe(first())
      .toPromise();

    const tokenAddr = '0x0000000000000000000000000000000000000001',
      tokenNetworkAddr = '0x0000000000000000000000000000000000000002';
    const log: Log = {
      blockNumber: 1337,
      blockHash: '0xblockHash',
      transactionIndex: 1,
      removed: false,
      transactionLogIndex: 1,
      address: registryContract.address,
      data: '0x',
      topics: [
        filter.topics![0], // eslint-disable-line @typescript-eslint/no-non-null-assertion
        defaultAbiCoder.encode(['address'], [tokenAddr]),
        defaultAbiCoder.encode(['address'], [tokenNetworkAddr]),
      ],
      transactionHash: '0xtxHash',
      logIndex: 1,
    };
    provider.emit(filter, log);

    const event = await promise;

    expect(event).toBeDefined();
    expect(event[0]).toBe(tokenAddr);
    expect(event[1]).toBe(tokenNetworkAddr);
    expect(event[2]).toMatchObject({
      address: registryContract.address,
      blockNumber: 1337,
      args: { '0': tokenAddr, '1': tokenNetworkAddr, length: 2 },
    });
  });

  test('pastEvents$ and newEvents$', async () => {
    const filter = registryContract.filters.TokenNetworkCreated(null, null);

    const pastTokenAddr = '0x0000000000000000000000000000000000000003',
      pastTokenNetworkAddr = '0x0000000000000000000000000000000000000004';

    const pastLog: Log = {
      blockNumber: 999,
      blockHash: '0xpastBlockHash',
      transactionIndex: 1,
      removed: false,
      transactionLogIndex: 1,
      address: registryContract.address,
      data: '0x',
      topics: [
        filter.topics![0], // eslint-disable-line @typescript-eslint/no-non-null-assertion
        defaultAbiCoder.encode(['address'], [pastTokenAddr]),
        defaultAbiCoder.encode(['address'], [pastTokenNetworkAddr]),
      ],
      transactionHash: '0xpastTxHash',
      logIndex: 1,
    };

    provider.getLogs.mockResolvedValueOnce([pastLog]);

    const promise = getEventsStream<TokenNetworkCreatedEvent>(
      registryContract,
      [filter],
      of(1),
      of(1336),
    )
      .pipe(
        take(2),
        toArray(),
      )
      .toPromise();

    const tokenAddr = '0x0000000000000000000000000000000000000001',
      tokenNetworkAddr = '0x0000000000000000000000000000000000000002';
    const log: Log = {
      blockNumber: 1337,
      blockHash: '0xblockHash',
      transactionIndex: 1,
      removed: false,
      transactionLogIndex: 1,
      address: registryContract.address,
      data: '0x',
      topics: [
        filter.topics![0], // eslint-disable-line @typescript-eslint/no-non-null-assertion
        defaultAbiCoder.encode(['address'], [tokenAddr]),
        defaultAbiCoder.encode(['address'], [tokenNetworkAddr]),
      ],
      transactionHash: '0xtxHash',
      logIndex: 1,
    };
    provider.emit(filter, log);

    const events = await promise;

    expect(events).toBeDefined();
    expect(events).toHaveLength(2);

    expect(events[1][0]).toBe(tokenAddr);
    expect(events[1][1]).toBe(tokenNetworkAddr);
    expect(events[1][2]).toMatchObject({
      address: registryContract.address,
      blockNumber: 1337,
      args: { '0': tokenAddr, '1': tokenNetworkAddr, length: 2 },
    });

    expect(events[0][0]).toBe(pastTokenAddr);
    expect(events[0][1]).toBe(pastTokenNetworkAddr);
    expect(events[0][2]).toMatchObject({
      address: registryContract.address,
      blockNumber: 999,
      args: { '0': pastTokenAddr, '1': pastTokenNetworkAddr, length: 2 },
    });
  });
});
