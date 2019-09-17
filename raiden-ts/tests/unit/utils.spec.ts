import * as t from 'io-ts';
import { fold, isRight } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';

import { of, combineLatest } from 'rxjs';
import { first, take, toArray } from 'rxjs/operators';

import { Event } from 'ethers/contract';
import { BigNumber, bigNumberify, keccak256, hexDataLength } from 'ethers/utils';
import { LosslessNumber } from 'lossless-json';

import { fromEthersEvent, getEventsStream } from 'raiden-ts/utils/ethers';
import { Address, BigNumberC, HexString, UInt, Secret, Timed, timed } from 'raiden-ts/utils/types';
import { LruCache } from 'raiden-ts/utils/lru';
import { encode, losslessParse, losslessStringify } from 'raiden-ts/utils/data';
import { splitCombined } from 'raiden-ts/utils/rxjs';
import { getLocksroot, makeSecret, getSecrethash } from 'raiden-ts/transfers/utils';
import { Lock } from 'raiden-ts/channels';
import { makeLog, raidenEpicDeps } from './mocks';

describe('fromEthersEvent', () => {
  const { provider } = raidenEpicDeps();

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
  const { provider, registryContract } = raidenEpicDeps();

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
    pipe(
      HexString().decode(B),
      fold(fail, result => expect(result).toBe(b)),
    );
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
    pipe(
      BigNumberC.decode(b),
      fold(fail, result => expect(result).toBeInstanceOf(BigNumber)),
    );
    expect(isRight(BigNumberC.decode(null))).toBe(false);
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

  test('Timed', () => {
    const TimedAddress = Timed(Address);
    type TimedAddress = t.TypeOf<typeof TimedAddress>;

    const address = '0x000000000000000000000000000000000004000A' as Address,
      data: TimedAddress = timed(address);
    expect(TimedAddress.is(data)).toBe(true);
    expect(TimedAddress.is(['invalid number', address])).toBe(false);
  });
});

test('LruCache', () => {
  const cache = new LruCache<string, { v: number }>(2);
  expect(cache.values.size).toBe(0);
  expect(cache.max).toBe(2);

  const v1 = { v: 1 },
    v2 = { v: 2 },
    v3 = { v: 3 };
  cache.put('1', v1);
  cache.put('2', v2);

  expect(cache.get('1')).toBe(v1);
  expect(cache.get('2')).toBe(v2);
  expect(cache.get('3')).toBeUndefined();

  cache.put('3', v3);
  expect(cache.get('3')).toBe(v3);
  expect(cache.get('2')).toBe(v2);
  expect(cache.get('1')).toBeUndefined();
  expect(cache.values.size).toBe(2);
});

describe('data', () => {
  test('encode', () => {
    expect(encode(3, 2)).toBe('0x0003');
    expect(encode('0x4001', 2)).toBe('0x4001');
    expect(encode([5, 6], 2)).toBe('0x0506');
    expect(encode(bigNumberify('48879'), 3)).toBe('0x00beef');

    expect(() => encode(-1, 2)).toThrowError('negative');
    expect(() => encode(bigNumberify(65537), 2)).toThrowError('too large');
    expect(() => encode('0x01', 2)).toThrowError('exact length');
    expect(() => encode((true as unknown) as number, 2)).toThrowError('data is not');
  });

  test('losslessParse', () => {
    const parsed = losslessParse('{"big":18446744073709551616,"small":65535 }');
    expect(parsed.big).toBeInstanceOf(LosslessNumber);
    expect(parsed.big.value).toBe('18446744073709551616');
    expect(parsed.small).toBe(65535);
  });

  test('losslessStringify', () => {
    const stringified = losslessStringify({ n: new LosslessNumber('18446744073709551616') });
    expect(stringified).toBe('{"n":18446744073709551616}');
  });
});

test('rxjs splitCombined', async () => {
  const src = combineLatest(of(1), of(2), of(3), of(4));
  const [of1, of2, of3, of4] = splitCombined(src);
  await expect(of1.toPromise()).resolves.toBe(1);
  await expect(of2.toPromise()).resolves.toBe(2);
  await expect(of3.toPromise()).resolves.toBe(3);
  await expect(of4.toPromise()).resolves.toBe(4);
});

describe('messages', () => {
  test('getLocksroot', () => {
    expect(getLocksroot([])).toBe(
      '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    );
    const locks: Lock[] = [
      {
        amount: bigNumberify(1) as UInt<32>,
        expiration: bigNumberify(1) as UInt<32>,
        secrethash: getSecrethash(keccak256('0x1') as Secret),
      },
      {
        amount: bigNumberify(2) as UInt<32>,
        expiration: bigNumberify(2) as UInt<32>,
        secrethash: getSecrethash(keccak256('0x2') as Secret),
      },
      {
        amount: bigNumberify(3) as UInt<32>,
        expiration: bigNumberify(3) as UInt<32>,
        secrethash: getSecrethash(keccak256('0x3') as Secret),
      },
    ];
    expect(getLocksroot([locks[0]])).toBe(
      '0xa006dee2839936dcff0101a74d3760319cecb7ce7fbca57be4a7e2bb86bbbfe6',
    );
    expect(getLocksroot(locks)).toBe(
      '0xe0cd0d2f9fb2ed8cf1ddc3789e62b6b6f83e2b174399202d7217333e141a910b',
    );
  });

  test('makeSecret', () => {
    const secret = makeSecret();
    expect(Secret.is(secret)).toBe(true);
    expect(hexDataLength(secret)).toBe(32);
  });
});
