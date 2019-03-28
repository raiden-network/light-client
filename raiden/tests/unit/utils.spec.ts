import { of } from 'rxjs';
import { first, take, toArray } from 'rxjs/operators';

import { EventFilter } from 'ethers';
import { Log } from 'ethers/providers/abstract-provider';
import { defaultAbiCoder } from 'ethers/utils/abi-coder';

import { fromEthersEvent, getEventsStream } from 'raiden/utils';
import { raidenEpicDeps } from './mocks';

function makeLog({
  filter,
  args,
  ...opts
}: {
  filter: EventFilter;
  args: [string, any][]; // eslint-disable-line @typescript-eslint/no-explicit-any
} & Partial<Log>): Log {
  const blockNumber = opts.blockNumber || 1337;
  return {
    blockNumber: blockNumber,
    blockHash: `0xblockHash${blockNumber}`,
    transactionIndex: 1,
    removed: false,
    transactionLogIndex: 1,
    address: filter.address!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
    data: '0x',
    transactionHash: `0xtxHash${blockNumber}`,
    logIndex: 1,
    ...opts,
    topics: [
      filter.topics![0], // eslint-disable-line @typescript-eslint/no-non-null-assertion
      ...args.map(([type, value]) => defaultAbiCoder.encode([type], [value])),
    ],
  };
}

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
    const log = makeLog({ filter, args: [['address', tokenAddr], ['address', tokenNetworkAddr]] });
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

    const pastLog = makeLog({
      blockNumber: 999,
      filter,
      args: [['address', pastTokenAddr], ['address', pastTokenNetworkAddr]],
    });

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
    const log = makeLog({ filter, args: [['address', tokenAddr], ['address', tokenNetworkAddr]] });
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
