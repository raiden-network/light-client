/* eslint-disable @typescript-eslint/camelcase */
import * as t from 'io-ts';
import { Address } from '../utils/types';

export const PathResults = t.readonly(
  t.intersection([
    t.type({
      result: t.readonlyArray(
        t.readonly(
          t.type({
            path: t.readonlyArray(Address),
            estimated_fee: t.number,
          }),
        ),
      ),
    }),
    t.partial({
      feedback_token: t.string,
    }),
  ]),
);
export interface PathResults extends t.TypeOf<typeof PathResults> {}
