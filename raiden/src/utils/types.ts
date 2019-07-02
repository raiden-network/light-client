/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import { BigNumber, bigNumberify, getAddress } from 'ethers/utils';
import { Two } from 'ethers/constants';
import { LosslessNumber } from 'lossless-json';

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
 * of ~53bits, as Raiden full-client/python stdlib json encode/decode longs as json number
 * (which is valid json despite not javascript-friendly)
 * TODO: get Raiden to string-serialize long ints, so we can drop lossless-json and use standard
 * JSON.parse/stringify and io-ts.encode/decode.
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

// map cache from size -> codecName -> codec
const sizedCodecCache: { [s: number]: { [n: string]: t.BrandC<any, SizedB<number>> } } = {};

/**
 * Return or create a cached sized codec
 * Given a size and a codec name, this function returns given codec name for size, or create and
 * cache a new one through 'factory' on first call. Useful to ensure single codec instance across
 * multiple calls, as well as enabling introspection through cache of size parameter.
 * @param size The size of the Sized brand (for caching/introspection)
 * @param name The name of the codec (for disambiguation of multiple codecs of the same size)
 * @param factory To create and cache a sized codec, if on first call for given parameters
 * @returns Cached codec for given size and name
 */
function makeSized<S extends number, C extends t.BrandC<any, SizedB<S>>>(
  size: S,
  name: string,
  factory: () => C,
): C {
  if (!(size in sizedCodecCache)) sizedCodecCache[size] = {};
  if (!(name in sizedCodecCache[size])) {
    sizedCodecCache[size as number][name] = factory();
  }
  return sizedCodecCache[size][name] as C;
}

/**
 * Returns the size (in bytes) of a sized brand
 * If the type is known, the return type is the literal size constant, or number otherwise
 * The codec must have been registered and the instance be cached previously, or else it'll return
 * an invalid size of -1.
 * @param codec Codec object of a SizedB branded type to query size of
 * @returns number representing size of the registered codec
 */
export function sizeOf<S extends number>(codec: t.BrandC<any, SizedB<S>>): S {
  for (const siz in sizedCodecCache) {
    for (const c in sizedCodecCache[siz]) {
      if (sizedCodecCache[siz][c] === codec) return +siz as S;
    }
  }
  return -1 as S; // shouldn't happen, as every created codec should be registered
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
export function HexString<S extends number = number>(size?: S) {
  const name = 'HexString';
  const siz: S = size === undefined ? (0 as S) : size;
  return makeSized(siz, name, () => {
    const regex = siz ? new RegExp(`^0x[0-9a-f]{${siz * 2}}$`, 'i') : /^0x([0-9a-f]{2})*$/i;
    return t.brand(
      t.string,
      (n): n is t.Branded<string, HexStringB<S>> => typeof n === 'string' && !!n.match(regex),
      name,
    );
  });
}

// string brand: non size-constrained hex-string codec and its type
export type HexString<S extends number = number> = t.Branded<string, HexStringB<S>>;

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
export function UInt<S extends number = number>(size?: S) {
  const name = 'UInt';
  return makeSized(size === undefined ? (0 as S) : size, name, () => {
    const max = size ? Two.pow(size * 8) : undefined;
    return t.brand(
      BigNumberC,
      (n): n is t.Branded<BigNumber, UIntB<S>> =>
        BigNumberC.is(n) && n.gte(0) && (max === undefined || n.lt(max)),
      name,
    );
  });
}
export type UInt<S extends number = number> = t.Branded<BigNumber, UIntB<S>>;

// specific types

// strig brand: ECDSA signature as an hex-string
export const Signature = HexString(65);
export type Signature = t.TypeOf<typeof Signature>;

// string brand: 256-bit hash, usually keccak256 or sha256
export const Hash = HexString(32);
export type Hash = t.TypeOf<typeof Hash>;

// string brand: a secret bytearray, non-sized
export const Secret = HexString();
export type Secret = t.TypeOf<typeof Secret>;

// string brand: ECDSA private key, 32 bytes
export const PrivateKey = HexString(32);
export type PrivateKey = t.TypeOf<typeof PrivateKey>;

// checksummed address brand interface
export interface AddressB {
  readonly Address: unique symbol;
}

// string brand: checksummed address, 20 bytes
export const Address = makeSized(20, 'Address', () =>
  t.brand(
    HexString(20),
    (u): u is t.Branded<HexString<20>, AddressB> => {
      try {
        return typeof u === 'string' && getAddress(u) === u;
      } catch (e) {}
      return false;
    }, // type guard for branded values
    'Address', // the name must match the readonly field in the brand
  ),
);
export type Address = t.TypeOf<typeof Address>;
