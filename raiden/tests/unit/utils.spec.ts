import { of } from 'rxjs';
import { first, take, toArray } from 'rxjs/operators';

import { Event } from 'ethers/contract';
import { BigNumber, bigNumberify } from 'ethers/utils';
import { LosslessNumber } from 'lossless-json';

import { fromEthersEvent, getEventsStream } from 'raiden/utils/ethers';
import { Address, BigNumberC, HexString, UInt } from 'raiden/utils/types';
import { makeLog, raidenEpicDeps } from './mocks';

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
  test('HexString', () => {
    // ensure same instance
    expect(HexString()).toBe(HexString(undefined));
    expect(HexString(20)).not.toBe(HexString());

    const b = '0xdeadbeef' as HexString;
    const B = HexString().encode(b);
    expect(HexString().is(B)).toBe(true);
    expect(B).toBe(b);
    const result = HexString().decode(B);
    expect(result.isRight()).toBe(true);
    expect(result.value).toBe(b);
  });

  test('UInt<8>', () => {
    expect(UInt(8)).toBe(UInt(8)); // ensure same instance
    expect(UInt(8).is(bigNumberify('18446744073709551615'))).toBe(true);
    expect(UInt(8).is(bigNumberify('18446744073709551616'))).toBe(false);
    expect(UInt(8).is(bigNumberify('-1'))).toBe(false);
  });

  test('UInt<32>', () => {
    expect(UInt(32)).toBe(UInt(32)); // ensure same instance
    expect(UInt(32)).not.toBe(UInt(8));
    expect(
      UInt(32).is(
        bigNumberify(
          '115792089237316195423570985008687907853269984665640564039457584007913129639935',
        ),
      ),
    ).toBe(true);
    expect(
      UInt(32).is(
        bigNumberify(
          '115792089237316195423570985008687907853269984665640564039457584007913129639936',
        ),
      ),
    ).toBe(false);
    expect(UInt(32).is(bigNumberify('-1'))).toBe(false);
  });

  test('BigNumberC', () => {
    const b = bigNumberify(16);
    expect(BigNumberC.is(b)).toBe(true);
    expect(BigNumberC.encode(b)).toEqual(new LosslessNumber('16'));
    const result = BigNumberC.decode(b);
    expect(result.isRight()).toBe(true);
    expect(result.value).toBeInstanceOf(BigNumber);
    const result2 = BigNumberC.decode(null);
    expect(result2.isRight()).toBe(false);
  });

  test('Address', () => {
    const address = '0x000000000000000000000000000000000004000A',
      address2 = '0x00000000000000000000000000000000000300Aa';

    const hexCodec = HexString(20);
    const hexPred = jest.spyOn(hexCodec, 'is');
    const addrPred = jest.spyOn(Address, 'is');

    expect(Address.is(address)).toBe(true);
    expect(Address.is(address.toLowerCase())).toBe(false);
    expect(Address.is(address2)).toBe(false);

    expect(hexPred).toHaveBeenCalledTimes(3); // 'parent' codec was also checked
    expect(addrPred).toHaveBeenCalledTimes(3);

    // narrow address to Address below
    if (!Address.is(address)) throw new Error('not an address');

    // functions receiving HexStrings should accept Address, as it's also an HexString
    function foo(h: HexString): HexString {
      return h;
    }
    function bar(h: HexString<20>): HexString<20> {
      return h;
    }
    expect(foo(address)).toBe(address);
    expect(bar(address)).toBe(address);
  });
});
