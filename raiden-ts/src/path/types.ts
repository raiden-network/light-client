import * as t from 'io-ts';
import { BigNumberish } from 'ethers/utils';
import { Address, Int } from '../utils/types';

/**
 * Codec for PFS API returned data
 */
export const PathResults = t.readonly(
  t.intersection([
    t.type({
      result: t.array(
        t.readonly(
          t.type({
            path: t.readonlyArray(Address),
            /* eslint-disable-next-line @typescript-eslint/camelcase */
            estimated_fee: Int(32),
          }),
        ),
      ),
    }),
    t.partial({
      /* eslint-disable-next-line @typescript-eslint/camelcase */
      feedback_token: t.string,
    }),
  ]),
);
export interface PathResults extends t.TypeOf<typeof PathResults> {}

/**
 * Codec for raiden-ts internal representation of a PFS result/routes
 */
export const Paths = t.array(
  t.readonly(
    t.type({
      path: t.readonlyArray(Address),
      fee: Int(32),
    }),
  ),
);
export type Paths = t.TypeOf<typeof Paths>;

/**
 * Public Raiden interface for routes data
 */
export type RaidenPaths = { readonly path: readonly string[]; readonly fee: BigNumberish }[];
