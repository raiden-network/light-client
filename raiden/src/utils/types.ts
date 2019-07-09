/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import { BigNumber, bigNumberify, getAddress, isHexString, hexDataLength } from 'ethers/utils';
import { Two } from 'ethers/constants';
import { LosslessNumber } from 'lossless-json';
import { memoize } from 'lodash';

/* A Subset of DOM's Storage/localStorage interface which supports async/await */
export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

const isStringifiable = (u: unknown): u is { toString: () => string } =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  u !== null && u !== undefined && typeof (u as any)['toString'] === 'function';
const isBigNumber = (u: unknown): u is BigNumber => u instanceof BigNumber;
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

/**
 * Creates a NEW codec for a specific [non-const] enum object
 */
export class EnumType<A> extends t.Type<A> {
  public readonly _tag: 'EnumType' = 'EnumType';
  public enumObject!: object;
  public constructor(e: object, name?: string) {
    super(
      name || 'enum',
      (u): u is A => Object.values(this.enumObject).some(v => v === u),
      (u, c) => (this.is(u) ? t.success(u) : t.failure(u, c)),
      t.identity,
    );
    this.enumObject = e;
  }
}

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
 * @param size Required number of bytes. Pass undefined or zero to have a variable-sized type
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

// brand interface for branded unsigned integers, inherits SizedB brand
export interface UIntB<S extends number> extends SizedB<S> {
  readonly UInt: unique symbol;
}

/**
 * Helper function to create codecs to validate an arbitrary or variable-sized BigNumbers
 * A branded codec/type to indicate size-validated BigNumbers
 * @param size Required number of bytes. Pass undefined or zero to have a variable-sized type
 * @returns branded codec for hex-encoded bytestrings
 */
export const UInt = memoize<
  <S extends number = number>(size?: S) => t.BrandC<typeof BigNumberC, UIntB<S>>
>(function<S extends number = number>(size?: S) {
  const max = size ? Two.pow(size * 8) : undefined;
  return t.brand(
    BigNumberC,
    (n): n is BigNumber & t.Brand<UIntB<S>> =>
      BigNumberC.is(n) && n.gte(0) && (max === undefined || n.lt(max)),
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
