import * as t from 'io-ts';
import { BigNumber, bigNumberify } from 'ethers/utils';
export { BigNumber, bigNumberify } from 'ethers/utils';

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

// simple helper function
export const createEnumType = <T>(e: object, name?: string): EnumType<T> =>
  new EnumType<T>(e, name);
