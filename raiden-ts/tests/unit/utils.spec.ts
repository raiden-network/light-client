/* eslint-disable @typescript-eslint/ban-ts-comment */

import * as t from 'io-ts';
import { fold, isRight } from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import { first } from 'rxjs/operators';

import { BigNumber, bigNumberify, keccak256, hexDataLength } from 'ethers/utils';

import { fromEthersEvent, getNetworkName } from 'raiden-ts/utils/ethers';
import {
  Address,
  BigNumberC,
  HexString,
  UInt,
  Secret,
  Timed,
  timed,
  decode,
} from 'raiden-ts/utils/types';
import { RaidenError, ErrorCodec, ErrorCodes } from 'raiden-ts/utils/error';
import { LruCache } from 'raiden-ts/utils/lru';
import { encode } from 'raiden-ts/utils/data';
import { getLocksroot, makeSecret, getSecrethash } from 'raiden-ts/transfers/utils';
import { Lock } from 'raiden-ts/channels';
import { LocksrootZero } from 'raiden-ts/constants';

const { JsonRpcProvider } = jest.requireActual('ethers/providers');

test('fromEthersEvent', async () => {
  expect.assertions(3);

  const provider = new JsonRpcProvider();
  const onSpy = jest.spyOn(provider, 'on');
  const removeListenerSpy = jest.spyOn(provider, 'removeListener');

  const promise = fromEthersEvent<number>(provider, 'block').pipe(first()).toPromise();
  provider.emit('block', 1337);
  const blockNumber = await promise;

  expect(blockNumber).toBe(1337);
  expect(onSpy).toHaveBeenCalledTimes(1);
  expect(removeListenerSpy).toHaveBeenCalledTimes(1);
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
      fold(fail, (result) => expect(result).toBe(b)),
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
    expect(BigNumberC.encode(b)).toEqual('16');
    pipe(
      BigNumberC.decode(b),
      fold(fail, (result) => expect(result).toBeInstanceOf(BigNumber)),
    );
    expect(isRight(BigNumberC.decode(null))).toBe(false);
  });

  test('Address', () => {
    const address = '0x000000000000000000000000000000000004000A',
      address2 = '0x00000000000000000000000000000000000300Aa';

    const addrPred = jest.spyOn(Address, 'is');

    expect(Address.is(address)).toBe(true);
    expect(Address.is(address.toLowerCase())).toBe(false);
    expect(Address.is(address2)).toBe(false);

    // can decode lowercased addresses
    const address2decoded = decode(Address, address2.toLowerCase());
    expect(address2decoded).toBeTruthy();
    expect(Address.is(address2decoded)).toBe(true);
    // still serializes to the checksummed format
    expect(address2decoded).not.toEqual(address2);
    expect(address2decoded).not.toEqual(address2.toLowerCase());

    expect(addrPred).toHaveBeenCalledTimes(4);

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
    const TimedAddress = Timed(t.type({ address: Address }));
    type TimedAddress = t.TypeOf<typeof TimedAddress>;

    const address = '0x000000000000000000000000000000000004000A' as Address,
      data: TimedAddress = timed({ address });
    expect(TimedAddress.is(data)).toBe(true);
    expect(TimedAddress.is({ address, ts: 'invalid number' })).toBe(false);
  });

  test('ErrorCodec', () => {
    let err;
    try {
      throw new RaidenError(ErrorCodes.RDN_GENERAL_ERROR);
    } catch (e) {
      err = e;
    }
    expect(ErrorCodec.is(err)).toBe(true);
    const encoded = ErrorCodec.encode(err);
    expect(encoded).toStrictEqual({
      name: 'RaidenError',
      message: ErrorCodes.RDN_GENERAL_ERROR,
      stack: expect.any(String),
      details: expect.anything(),
    });
    expect(decode(ErrorCodec, encoded)).toStrictEqual(err);
    const decoded = decode(ErrorCodec, encoded);
    expect(decoded).toBeInstanceOf(RaidenError);
    expect(decoded.message).toBe(ErrorCodes.RDN_GENERAL_ERROR);
    expect(decoded.stack).toBeTruthy();
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
    expect(() => encode('0x01', 2)).toThrowError(ErrorCodes.DTA_ARRAY_LENGTH_DIFFERENCE);
    // @ts-expect-error
    expect(() => encode(null, 2)).toThrowError(
      'Passed data is not a HEX string nor integer array',
    );
  });
});

describe('messages', () => {
  test('getLocksroot', () => {
    expect(getLocksroot([])).toBe(
      '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    );
    expect(getLocksroot([])).toBe(LocksrootZero);
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

describe('RaidenError', () => {
  test('RaidenError is instance of its custom class', () => {
    try {
      throw new RaidenError(ErrorCodes.PFS_DISABLED);
    } catch (err) {
      expect(err).toBeInstanceOf(RaidenError);
      expect(err instanceof Error).toBeTruthy();
      expect(err.name).toEqual('RaidenError');
    }
  });

  test('Has stack trace w/ class name and developer-friendly message', () => {
    try {
      function doSomething() {
        throw new RaidenError(ErrorCodes.PFS_DISABLED);
      }
      doSomething();
    } catch (err) {
      // Stack trace exists
      expect(err.stack).toBeDefined();

      // Stack trace starts with the error message
      expect(err.stack.split('\n').shift()).toEqual(
        'RaidenError: Pathfinding Service is disabled and no direct route is available.',
      );

      // Stack trace contains function where error was thrown
      expect(err.stack.split('\n')[1]).toContain('doSomething');
    }
  });

  test('End user "code" property is set', () => {
    try {
      throw new RaidenError(ErrorCodes.PFS_DISABLED);
    } catch (err) {
      expect(err.code).toBeDefined();
      expect(err.code).toEqual('PFS_DISABLED');
    }
  });

  test('Details can be added and are shown in stack trace', () => {
    try {
      throw new RaidenError(ErrorCodes.PFS_DISABLED, { value: 'bar', key: 'foo' });
    } catch (err) {
      expect(err.details).toStrictEqual({ value: 'bar', key: 'foo' });
    }
  });
});

test('getNetworkName', () => {
  expect(getNetworkName({ name: 'unknown', chainId: 1337 })).toBe('1337');
  expect(getNetworkName({ name: 'homestead', chainId: 1 })).toBe('mainnet');
  expect(getNetworkName({ name: 'goerli', chainId: 5 })).toBe('goerli');
});
