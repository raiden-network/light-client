/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import { Either, isLeft, Right } from 'fp-ts/lib/Either';
import { PathReporter } from 'io-ts/lib/PathReporter';

import { BigNumber } from '@ethersproject/bignumber';
import { getAddress } from '@ethersproject/address';
import { isHexString, hexDataLength } from '@ethersproject/bytes';
import { Two, Zero } from '@ethersproject/constants';

import memoize from 'lodash/memoize';

import { RaidenError } from './error';

/* A Subset of DOM's Storage/localStorage interface which supports async/await */
export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

function reporterAssert<T>(value: Either<t.Errors, T>): asserts value is Right<T> {
  if (isLeft(value)) {
    throw new Error(PathReporter.report(value).join('\n'));
  }
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
 * Input can be anything BigNumber.from-able: number, string or jsonStringified BigNumber object
 * Output is string, so we can JSON-serialize with 'number's types bigger than JS VM limits
 * of ±2^53, as Raiden python client stdlib json encode longs as string.
 */
export interface BigNumberC extends t.Type<BigNumber, string> {}
export const BigNumberC: BigNumberC = new t.Type<BigNumber, string>(
  'BigNumber',
  BigNumber.isBigNumber,
  (u, c) => {
    try {
      // BigNumber.from is able to decode number, strings and JSON.parse'd {_hex:<str>} objects
      return t.success(BigNumber.from(u as any));
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
// string brand: informs/requires a string which is hex-encoded, 0x-prefixed and of size bytes
export type HexString<S extends number = number> = string & t.Brand<HexStringB<S>>;
// codec type for the HexString brand
export interface HexStringC<S extends number>
  extends t.RefinementType<typeof t.string, HexString<S>, string> {}

/**
 * Helper function to create codecs to validate an arbitrary or variable-sized hex bytestring
 * A branded codec to indicate validated hex-strings
 *
 * @param size - Required number of bytes. Pass undefined or zero to have a variable-sized type
 * @returns branded codec for hex-encoded bytestrings
 */
export const HexString: <S extends number = number>(size?: S) => HexStringC<S> = memoize(function <
  S extends number = number
>(size?: S) {
  return t.brand(
    t.string,
    (n): n is HexString<S> =>
      typeof n === 'string' && (size ? hexDataLength(n) === size : isHexString(n)),
    'HexString',
  );
});

// brand interface for branded signed integers, inherits SizedB brand
export interface IntB<S extends number> extends SizedB<S> {
  readonly Int: unique symbol;
}
// Int brand: informs/requires a BigNumber which fits in given size of bytes
export type Int<S extends number = number> = BigNumber & t.Brand<IntB<S>>;
// codec type for the Int brand
export interface IntC<S extends number>
  extends t.RefinementType<BigNumberC, Int<S>, t.OutputOf<BigNumberC>> {}

/**
 * Helper function to create codecs to validate an arbitrary or variable-sized BigNumbers
 * A branded codec/type to indicate size-validated BigNumbers
 *
 * @param size - Required number of bytes. Pass undefined to have a variable-sized type
 * @returns branded codec for hex-encoded bytestrings
 */
export const Int: <S extends number = number>(size?: S) => IntC<S> = memoize(function <
  S extends number = number
>(size?: S) {
  const min = size ? Zero.sub(Two.pow(size * 8 - 1)) : undefined,
    max = size ? Two.pow(size * 8 - 1) : undefined;
  return t.brand(
    BigNumberC,
    (n): n is Int<S> => BigNumberC.is(n) && (!min || !max || (n.gte(min) && n.lt(max))),
    'Int',
  );
});

// brand interface for branded unsigned integers, inherits SizedB brand
export interface UIntB<S extends number> extends SizedB<S> {
  readonly UInt: unique symbol;
}
// UInt brand: informs/requires a positive BigNumber which fits in given size of bytes
export type UInt<S extends number = number> = BigNumber & t.Brand<UIntB<S>>;
// codec type for the UInt brand
export interface UIntC<S extends number = number>
  extends t.RefinementType<BigNumberC, UInt<S>, t.OutputOf<BigNumberC>> {}

/**
 * Helper function to create codecs to validate an arbitrary or variable-sized BigNumbers
 * A branded codec/type to indicate size-validated BigNumbers
 *
 * @param size - Required number of bytes. Pass undefined to have a variable-sized type
 * @returns branded codec for hex-encoded bytestrings
 */
export const UInt: <S extends number = number>(size?: S) => UIntC<S> = memoize(function <
  S extends number = number
>(size?: S) {
  const min = size ? Zero : undefined,
    max = size ? Two.pow(size * 8) : undefined;
  return t.brand(
    BigNumberC,
    (n): n is UInt<S> => BigNumberC.is(n) && (!min || !max || (n.gte(min) && n.lt(max))),
    'UInt',
  );
});

// specific types

// strig brand: ECDSA signature as an hex-string
export const Signature = HexString(65);
export type Signature = HexString<65>;

// string brand: 256-bit hash, usually keccak256 or sha256
export const Hash = HexString(32);
export type Hash = HexString<32>;

// string brand: a secret bytearray, 32 bytes
export const Secret = HexString(32);
export type Secret = HexString<32>;

// string brand: ECDSA private key, 32 bytes
export const PrivateKey = HexString(32);
export type PrivateKey = HexString<32>;

// checksummed address brand interface
export interface AddressB {
  readonly Address: unique symbol;
}

// string brand: checksummed address, 20 bytes
export type Address = HexString<20> & t.Brand<AddressB>;
export interface AddressC extends t.RefinementType<HexStringC<20>, Address, string> {}
function isAddress(u: unknown): u is Address {
  try {
    return getAddress(u as string) === u;
  } catch (e) {
    return false;
  }
}
export const Address: AddressC = new t.RefinementType<HexStringC<20>, Address, string>(
  'Address',
  isAddress,
  (u, c) => {
    try {
      return t.success(getAddress(u as string) as Address);
    } catch (e) {
      return t.failure(u, c);
    }
  },
  t.identity,
  HexString(20),
  isAddress,
);

/**
 * Helper type to extend a given type T to contain a timestamp ts member
 */
export type Timed<T> = T & { readonly ts: number };
export interface TimedC<T extends t.Mixed>
  extends t.IntersectionC<[T, t.ReadonlyC<t.TypeC<{ ts: t.NumberC }>>]> {}
/**
 * Helper function to create codecs to validate derived types containing a timestamp ts
 *
 * @param codec - Codec to compose with a ts timestamp property
 * @returns Codec validating such subtype
 */
export const Timed: <T extends t.Mixed>(
  codec: T,
) => TimedC<T> = memoize(<T extends t.Mixed>(codec: T) =>
  t.intersection([codec, t.readonly(t.type({ ts: t.number }))]),
);

/**
 * Given a value of type T, returns a Timed<T> with current time as 'ts' member
 *
 * @param v - Value to return with time
 * @returns copy of v added of a ts numeric timestamp
 */
export function timed<T>(v: T): Timed<T> {
  return { ...v, ts: Date.now() };
}

/**
 * Remove ts timestamp field (from timed) from object passed as parameter (immutably)
 *
 * @param v - Timed object
 * @returns return a copy of v without ts property
 */
export function untime<T extends { readonly ts: number }>(v: T): Omit<T, 'ts'> {
  const { ts: _, ...withoutTs } = v;
  return withoutTs;
}

// generic type codec for messages that must be signed
// use it like: Codec = Signed(Message)
// The t.TypeOf<typeof codec> will be Signed<Message>, defined later
export type Signed<M> = M & { readonly signature: Signature };
export interface SignedC<C extends t.Mixed>
  extends t.IntersectionC<[C, t.ReadonlyC<t.TypeC<{ signature: typeof Signature }>>]> {}
export const Signed: <C extends t.Mixed>(
  codec: C,
) => SignedC<C> = memoize(<C extends t.Mixed>(codec: C) =>
  t.intersection([codec, t.readonly(t.type({ signature: Signature }))]),
);

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

/**
 * Infer type of last element of a tuple or array
 * Currently supports tuples of up to 9 elements before falling back to array's inference
 *
 * FIXME: may be simplified with variadic tuple types from TypeScript 4.0
 */
export type Last<T extends any[]> = T extends [any, any, any, any, any, any, any, any, infer L]
  ? L
  : T extends [any, any, any, any, any, any, any, infer L]
  ? L
  : T extends [any, any, any, any, any, any, infer L]
  ? L
  : T extends [any, any, any, any, any, infer L]
  ? L
  : T extends [any, any, any, any, infer L]
  ? L
  : T extends [any, any, any, infer L]
  ? L
  : T extends [any, any, infer L]
  ? L
  : T extends [any, infer L]
  ? L
  : T extends [infer L]
  ? L
  : T[number] | undefined;

/**
 * Like lodash's last, but properly infer return type when argument is a tuple
 *
 * @param arr - Tuple or array to get last element from
 * @returns Last element from arr
 */
export function last<T extends any[]>(arr: T): Last<T> {
  return arr[arr.length - 1];
}

/**
 * Math.max for BigNumbers
 *
 * @param args - Parameters to compare, must have at least one element
 * @returns Maxium of parameters as per BigNumber's lt comparison
 */
export function bnMax<T extends BigNumber>(...args: [T, ...T[]]): T {
  return args.reduce((a, b) => (a.lt(b) ? b : a));
}
