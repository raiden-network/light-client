/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import { BigNumber, bigNumberify, getAddress, isHexString, hexDataLength } from 'ethers/utils';
import { Two, Zero } from 'ethers/constants';
import { Either, Right } from 'fp-ts/lib/Either';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import memoize from 'lodash/memoize';
import { RaidenError } from './error';

/* A Subset of DOM's Storage/localStorage interface which supports async/await */
export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

function reporterAssert<T>(value: Either<t.Errors, T>): asserts value is Right<T> {
  ThrowReporter.report(value);
}

/**
 * Decode/validate like codec.decode, but throw or return right instead of Either
 *
 * @param codec - io-ts codec to be used for decoding/validation
 * @param data - data to decode/validate
 * @param customError - Message or error to throw if the decoding fails
 * @param log - Logger to log error to
 * @returns Decoded value of codec type
 */
export function decode<C extends t.Mixed>(
  codec: C,
  data: C['_I'],
  customError?: string | Error,
  log?: (...args: any[]) => void,
): C['_A'] {
  try {
    const decoded = codec.decode(data);
    reporterAssert(decoded);
    return decoded.right;
  } catch (originalError) {
    log?.('__decode failed:', codec, data);

    if (!customError) {
      throw originalError;
    } else {
      throw customError instanceof Error ? customError : new RaidenError(customError);
    }
  }
}

/**
 * Test for value's non-nulliness
 * Like lodash's negate(isNil), but also works as type guard (e.g. useful for filters)
 *
 * @param value - to be tested
 * @returns true if value is not null nor undefined
 */
export function isntNil<T>(value: T): value is NonNullable<T> {
  return value != null;
}

/**
 * Codec of ethers.utils.BigNumber objects
 *
 * Input can be anything bigNumberify-able: number, string, LosslessNumber or BigNumber
 * Output is string, so we can JSON-serialize with 'number's types bigger than JS VM limits
 * of ±2^53, as Raiden python client stdlib json encode longs as string.
 */
export const BigNumberC = new t.Type<BigNumber, string>(
  'BigNumber',
  BigNumber.isBigNumber,
  (u, c) => {
    if (BigNumber.isBigNumber(u)) return t.success(u);
    try {
      // decode by trying to bigNumberify string representation of anything
      return t.success(bigNumberify(((u as any)?._hex ?? (u as any)).toString()));
    } catch (err) {
      return t.failure(u, c);
    }
  },
  (a) => a.toString(),
);

// sized brands interfaces must derive from this interface
export interface SizedB<S extends number> {
  readonly size: S;
}

// brand interface for branded hex strings, inherits SizedB brand
export interface HexStringB<S extends number> extends SizedB<S> {
  readonly HexString: unique symbol;
}

/**
 * Helper function to create codecs to validate an arbitrary or variable-sized hex bytestring
 * A branded codec to indicate validated hex-strings
 *
 * @param size - Required number of bytes. Pass undefined or zero to have a variable-sized type
 * @returns branded codec for hex-encoded bytestrings
 */
export const HexString: <S extends number = number>(
  size?: S,
) => t.BrandC<t.StringC, HexStringB<S>> = memoize(function <S extends number = number>(size?: S) {
  return t.brand(
    t.string,
    (n): n is string & t.Brand<HexStringB<S>> =>
      typeof n === 'string' && (size ? hexDataLength(n) === size : isHexString(n)),
    'HexString',
  );
});

// string brand: non size-constrained hex-string codec and its type
export type HexString<S extends number = number> = string & t.Brand<HexStringB<S>>;

// brand interface for branded signed integers, inherits SizedB brand
export interface IntB<S extends number> extends SizedB<S> {
  readonly Int: unique symbol;
}

/**
 * Helper function to create codecs to validate an arbitrary or variable-sized BigNumbers
 * A branded codec/type to indicate size-validated BigNumbers
 *
 * @param size - Required number of bytes. Pass undefined to have a variable-sized type
 * @returns branded codec for hex-encoded bytestrings
 */
export const Int: <S extends number = number>(
  size?: S,
) => t.BrandC<typeof BigNumberC, IntB<S>> = memoize(function <S extends number = number>(
  size?: S,
) {
  const min = size ? Zero.sub(Two.pow(size * 8 - 1)) : undefined,
    max = size ? Two.pow(size * 8 - 1) : undefined;
  return t.brand(
    BigNumberC,
    (n): n is BigNumber & t.Brand<IntB<S>> =>
      BigNumberC.is(n) && (!min || !max || (n.gte(min) && n.lt(max))),
    'Int',
  );
});
export type Int<S extends number = number> = BigNumber & t.Brand<IntB<S>>;

// brand interface for branded unsigned integers, inherits SizedB brand
export interface UIntB<S extends number> extends SizedB<S> {
  readonly UInt: unique symbol;
}

/**
 * Helper function to create codecs to validate an arbitrary or variable-sized BigNumbers
 * A branded codec/type to indicate size-validated BigNumbers
 *
 * @param size - Required number of bytes. Pass undefined to have a variable-sized type
 * @returns branded codec for hex-encoded bytestrings
 */
export const UInt: <S extends number = number>(
  size?: S,
) => t.BrandC<typeof BigNumberC, UIntB<S>> = memoize(function <S extends number = number>(
  size?: S,
) {
  const min = size ? Zero : undefined,
    max = size ? Two.pow(size * 8) : undefined;
  return t.brand(
    BigNumberC,
    (n): n is BigNumber & t.Brand<UIntB<S>> =>
      BigNumberC.is(n) && (!min || !max || (n.gte(min) && n.lt(max))),
    'UInt',
  );
});
export type UInt<S extends number = number> = BigNumber & t.Brand<UIntB<S>>;

// specific types

// strig brand: ECDSA signature as an hex-string
export const Signature = HexString(65);
export type Signature = string & t.Brand<HexStringB<65>>;

// string brand: 256-bit hash, usually keccak256 or sha256
export const Hash = HexString(32);
export type Hash = string & t.Brand<HexStringB<32>>;

// string brand: a secret bytearray, 32 bytes
export const Secret = HexString(32);
export type Secret = string & t.Brand<HexStringB<32>>;

// string brand: ECDSA private key, 32 bytes
export const PrivateKey = HexString(32);
export type PrivateKey = string & t.Brand<HexStringB<32>>;

// checksummed address brand interface
export interface AddressB {
  readonly Address: unique symbol;
}

// string brand: checksummed address, 20 bytes
export type Address = string & t.Brand<HexStringB<20>> & t.Brand<AddressB>;
export const Address = new t.Type<Address, string>(
  'Address',
  (u: unknown): u is Address => {
    try {
      return HexString(20).is(u) && getAddress(u) === u;
    } catch (e) {
      return false;
    }
  },
  (u, c) => {
    if (!HexString(20).is(u)) return t.failure(u, c);
    let addr;
    try {
      addr = getAddress(u);
    } catch (e) {
      return t.failure(u, c);
    }
    if (!addr) return t.failure(u, c);
    return t.success(addr as Address);
  },
  t.identity,
);

/**
 * Helper function to create codecs to validate [timestamp, value] tuples
 *
 * @param codec - Codec to compose with a timestamp in a tuple
 * @returns Codec of a tuple of timestamp and codec type
 */
export const Timed: <T extends t.Mixed>(
  codec: T,
) => t.TupleC<[t.NumberC, T]> = memoize(<T extends t.Mixed>(codec: T) =>
  t.tuple([t.number, codec]),
);
export type Timed<T> = [number, T];

/**
 * Given a value of type T, returns a Timed<T> tuple with current time as first value
 *
 * @param v - Value to return with time
 * @returns Tuple of call timestamp as first elemtn and value passed as parameter as second
 */
export function timed<T>(v: T): Timed<T> {
  return [Date.now(), v];
}

// generic type codec for messages that must be signed
// use it like: Codec = Signed(Message)
// The t.TypeOf<typeof codec> will be Signed<Message>, defined later
export const Signed: <C extends t.Mixed>(
  codec: C,
) => t.IntersectionC<
  [
    C,
    t.ReadonlyC<
      t.TypeC<{
        signature: typeof Signature;
      }>
    >,
  ]
> = memoize(<C extends t.Mixed>(codec: C) =>
  t.intersection([codec, t.readonly(t.type({ signature: Signature }))]),
);
export type Signed<M> = M & { signature: Signature };

export interface Newable {
  new (...args: any[]): any;
}

/**
 * Memoized factory to create codecs validating an arbitrary class C
 *
 * @param C - Class to create a codec for
 * @returns Codec validating class C
 */
export const instanceOf: <C extends Newable>(C: C) => t.Type<InstanceType<C>> = memoize(
  <C extends Newable>(C: C): t.Type<InstanceType<C>> =>
    new t.Type<InstanceType<C>>(
      `instanceOf(${C.name})`,
      (v): v is InstanceType<C> => v instanceof C,
      (i, c) => (i instanceof C ? t.success<InstanceType<C>>(i) : t.failure(i, c)),
      t.identity,
    ),
);
