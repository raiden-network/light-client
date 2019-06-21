import * as t from 'io-ts';
import { BigNumber, bigNumberify, getAddress } from 'ethers/utils';

/* A Subset of DOM's Storage/localStorage interface which supports async/await */
export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

const StringOrNumber = t.union([t.string, t.number]);

const isBigNumber = (u: unknown): u is BigNumber => u instanceof BigNumber;
/**
 * Codec of ethers.utils.BigNumber objects, to/from Decimal string
 */
export const BigNumberC = new t.Type<BigNumber, string>(
  'BigNumber',
  isBigNumber,
  (u, c) => {
    if (isBigNumber(u)) return t.success(u);
    return StringOrNumber.validate(u, c).chain(s => {
      try {
        return t.success(bigNumberify(s));
      } catch (err) {
        return t.failure(s, c, err.message);
      }
    });
  },
  a => a.toString(),
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

/**
 * Helper type to declare and validate an arbitrary or variable-sized hex bytestring
 * Like a branded codec, but allows custom/per-size sub-types
 * @param size Required number of bytes. Pass undefined or zero to have a variable-sized type
 * @param name Optional type name.
 */
export class HexBytes<S extends number | undefined> extends t.Type<string> {
  public readonly _tag: 'HexString' = 'HexString';
  public size: S;
  private regex = /^0x([0-9a-f]{2})*$/i;
  public constructor(size: S, name?: string) {
    super(
      name || (size ? `HexString<${size}>` : 'HexString'),
      (u): u is string => typeof u === 'string' && !!u.match(this.regex),
      (u, c) => (this.is(u) ? t.success(u) : t.failure(u, c)),
      t.identity,
    );
    this.size = size;
    if (typeof size === 'number' && size > 0) {
      this.regex = new RegExp(`^0x[0-9a-f]{${size * 2}}$`, 'i');
    }
  }
}

// Positive & PositiveInt taken from io-ts Readme
export interface PositiveBrand {
  readonly Positive: unique symbol; // use `unique symbol` here to ensure uniqueness across modules / packages
}

export const Positive = t.brand(
  t.number, // a codec representing the type to be refined
  (n): n is t.Branded<number, PositiveBrand> => n >= 0, // a custom type guard using the build-in helper `Branded`
  'Positive', // the name must match the readonly field in the brand
);
export type Positive = t.TypeOf<typeof Positive>;

export const PositiveInt = t.intersection([t.Int, Positive]);
export type PositiveInt = t.TypeOf<typeof PositiveInt>;

export const Bytes = new HexBytes(undefined);
export type Bytes = t.TypeOf<typeof Bytes>;

export const Signature = new HexBytes(65, 'Signature');
export type Signature = t.TypeOf<typeof Signature>;

export const Hash = new HexBytes(32, 'Hash');
export type Hash = t.TypeOf<typeof Hash>;

export const Secret = new HexBytes(undefined, 'Secret');
export type Secret = t.TypeOf<typeof Secret>;

export const PrivateKey = new HexBytes(32, 'PrivateKey');
export type PrivateKey = t.TypeOf<typeof PrivateKey>;

const isAddress = (u: unknown): u is string => {
  try {
    return typeof u === 'string' && getAddress(u) === u;
  } catch (e) {}
  return false;
};
/**
 * Validate a string is a checksummed address
 */
export const Address = new t.Type<string>(
  'Address',
  isAddress,
  (u, c) => (isAddress(u) ? t.success(u) : t.failure(u, c)),
  t.identity,
);
export type Address = t.TypeOf<typeof Address>;
