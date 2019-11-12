/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import { BigNumber, bigNumberify, getAddress, isHexString, hexDataLength } from 'ethers/utils';
import { Two, Zero } from 'ethers/constants';
import { LosslessNumber } from 'lossless-json';
import { memoize } from 'lodash';
import { isLeft } from 'fp-ts/lib/Either';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';

/* A Subset of DOM's Storage/localStorage interface which supports async/await */
export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Decode/validate like codec.decode, but throw or return right instead of Either
 * TODO: add assert signature after TS 3.7
 *
 * @param codec - io-ts codec to be used for decoding/validation
 * @param data - data to decode/validate
 * @returns Decoded value of codec type
 */
export function decode<C extends t.Mixed>(codec: C, data: C['_I']): C['_A'] {
  const decoded = codec.decode(data);
  // report already throw, so the throw here is just for type narrowing in context
  if (isLeft(decoded)) throw ThrowReporter.report(decoded);
  return decoded.right;
}

const isStringifiable = (u: unknown): u is { toString: () => string } =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  u !== null && u !== undefined && typeof (u as any)['toString'] === 'function';
const isBigNumber = (u: unknown): u is BigNumber => u && (u as any)['_ethersType'] === 'BigNumber';
/**
 * Codec of ethers.utils.BigNumber objects
 * Input can be anything bigNumberify-able: number, string, LosslessNumber or BigNumber
 * Output is LosslessNumber, so we can JSON-serialize with 'number' types bigger than JS VM limits
 * of ±2^53, as Raiden full-client/python stdlib json encode/decode longs as json number.
 */
export const BigNumberC = new t.Type<BigNumber, LosslessNumber>(
  'BigNumber',
  isBigNumber,
  (u, c) => {
    if (isBigNumber(u)) return t.success(u);
    try {
      if (isStringifiable(u)) return t.success(bigNumberify(u.toString()));
    } catch (err) {
      return t.failure(u, c, err.message);
    }
    return t.failure(u, c);
  },
  a => new LosslessNumber(a.toString()),
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
export const HexString = memoize<
  <S extends number = number>(size?: S) => t.BrandC<t.StringC, HexStringB<S>>
>(function<S extends number = number>(size?: S) {
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
export const Int = memoize<
  <S extends number = number>(size?: S) => t.BrandC<typeof BigNumberC, IntB<S>>
>(function<S extends number = number>(size?: S) {
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
export const UInt = memoize<
  <S extends number = number>(size?: S) => t.BrandC<typeof BigNumberC, UIntB<S>>
>(function<S extends number = number>(size?: S) {
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

// string brand: a secret bytearray, non-sized
export const Secret = HexString();
export type Secret = string & t.Brand<HexStringB<number>>;

// string brand: ECDSA private key, 32 bytes
export const PrivateKey = HexString(32);
export type PrivateKey = string & t.Brand<HexStringB<32>>;

// checksummed address brand interface
export interface AddressB {
  readonly Address: unique symbol;
}

// string brand: checksummed address, 20 bytes
export const Address = t.brand(
  HexString(20),
  (u): u is HexString<20> & t.Brand<AddressB> => {
    try {
      return typeof u === 'string' && getAddress(u) === u;
    } catch (e) {}
    return false;
  }, // type guard for branded values
  'Address', // the name must match the readonly field in the brand
);
export type Address = string & t.Brand<HexStringB<20>> & t.Brand<AddressB>;

/**
 * Helper function to create codecs to validate [timestamp, value] tuples
 *
 * @param codec - Codec to compose with a timestamp in a tuple
 * @returns Codec of a tuple of timestamp and codec type
 */
export const Timed = memoize<<T extends t.Mixed>(codec: T) => t.TupleC<[t.NumberC, T]>>(
  <T extends t.Mixed>(codec: T) => t.tuple([t.number, codec]),
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
export const Signed = memoize<
  <C extends t.Mixed>(
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
  >
>(<C extends t.Mixed>(codec: C) =>
  t.intersection([codec, t.readonly(t.type({ signature: Signature }))]),
);
export type Signed<M> = M & { signature: Signature };
