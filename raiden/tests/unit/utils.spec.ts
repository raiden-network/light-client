import { of } from 'rxjs';
import { first, take, toArray } from 'rxjs/operators';

import { Event } from 'ethers/contract';
import { bigNumberify, BigNumber } from 'ethers/utils';

import { fromEthersEvent, getEventsStream } from 'raiden/utils/ethers';
import { Address, BigNumberC, HexString, Positive, PositiveInt, sizeOf } from 'raiden/utils/types';
import { raidenEpicDeps, makeLog } from './mocks';

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
    const log = makeLog({
      filter: registryContract.filters.TokenNetworkCreated(tokenAddr, tokenNetworkAddr),
    });
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
      filter: registryContract.filters.TokenNetworkCreated(pastTokenAddr, pastTokenNetworkAddr),
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
    const log = makeLog({
      filter: registryContract.filters.TokenNetworkCreated(tokenAddr, tokenNetworkAddr),
    });
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
    const pastEvent = events[0][2];
    expect(pastEvent).toMatchObject({
      address: registryContract.address,
      blockNumber: 999,
      args: { '0': pastTokenAddr, '1': pastTokenNetworkAddr, length: 2 },
    });
    pastEvent.removeListener();

    pastEvent.getBlock();
    pastEvent.getTransaction();
    pastEvent.getTransactionReceipt();

    expect(provider.getBlock).toHaveBeenCalledWith(pastLog.blockHash);
    expect(provider.getTransaction).toHaveBeenCalledWith(pastLog.transactionHash);
    expect(provider.getTransactionReceipt).toHaveBeenCalledWith(pastLog.transactionHash);
  });
});

describe('types', () => {
  test('HexBytes & Bytes', () => {
    const b = '0xdeadbeef' as HexString;
    const B = HexString.encode(b);
    expect(HexString.is(B)).toBe(true);
    expect(B).toBe(b);
    const result = HexString.decode(B);
    expect(result.isRight()).toBe(true);
    expect(result.value).toBe(b);
  });

  test('Positive & PositiveInt', () => {
    expect(PositiveInt.is(1)).toBe(true);
    expect(PositiveInt.is(-1)).toBe(false);
    expect(PositiveInt.is(1.5)).toBe(false);
    expect(Positive.is(1.5)).toBe(true);
  });

  test('BigNumberC', () => {
    const b = bigNumberify(16);
    expect(BigNumberC.is(b)).toBe(true);
    expect(BigNumberC.encode(b)).toBe('16');
    const result = BigNumberC.decode(b);
    expect(result.isRight()).toBe(true);
    expect(result.value).toBeInstanceOf(BigNumber);
  });

  test('sizeOf', () => {
    expect(sizeOf(HexString)).toBe(0);
    expect(sizeOf(Address)).toBe(20);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sizeOf(1 as any)).toBe(-1); // to test unreachable case
  });
});
