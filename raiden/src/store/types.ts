import * as t from 'io-ts';
import { BigNumber, bigNumberify } from 'ethers/utils';

const StringOrNumber = t.union([t.string, t.number]);

const bigNumberGuard = (u: unknown): u is BigNumber => u instanceof BigNumber;
export const BigNumberType = new t.Type<BigNumber, string>(
  'BigNumber',
  bigNumberGuard,
  (u, c) => {
    if (bigNumberGuard(u)) return t.success(u);
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

// EnumType Class
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

export interface ChannelId {
  tokenNetwork: string;
  partner: string;
}

/**
 * Helper type to declare and validate an arbitrary or variable-sized hex bytestring
 * Like a branded codec, but allows custom/per size sub-types
 */
export class HexBytes<S extends number | undefined = undefined> extends t.Type<string> {
  public readonly _tag: 'HexString' = 'HexString';
  public size: S;
  private regex = /^0x[0-9a-f]*$/i;
  public constructor(name?: string, size?: S) {
    super(
      name || (size ? `HexString<${size}>` : 'HexString'),
      (u): u is string => typeof u === 'string' && !!u.match(this.regex),
      (u, c) => (this.is(u) ? t.success(u) : t.failure(u, c)),
      t.identity,
    );
    this.size = (size as unknown) as S;
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

export const Signature = new HexBytes('Signature', 65);
export type Signature = t.TypeOf<typeof Signature>;

export const Hash = new HexBytes('Hash', 32);
export type Hash = t.TypeOf<typeof Hash>;

export const Secret = new HexBytes();
export type Secret = t.TypeOf<typeof Secret>;

// TODO?: validate checksum
export const Address = new HexBytes('Address', 20);
export type Address = t.TypeOf<typeof Address>;
