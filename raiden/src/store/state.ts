import * as t from 'io-ts';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';

import { Address } from '../utils/types';
import { Channel } from '../channels';
import { RaidenMatrixSetup } from '../transport/state';

// types

export const RaidenState = t.intersection([
  t.type({
    address: Address,
    blockNumber: t.number,
    tokenNetworks: t.record(Address, t.record(Address, Channel)),
    token2tokenNetwork: t.record(Address, Address),
  }),
  t.partial({
    transport: t.partial({
      matrix: t.intersection([
        t.type({
          server: t.string,
        }),
        t.partial({
          setup: RaidenMatrixSetup,
          address2rooms: t.record(Address, t.array(t.string)),
        }),
      ]),
    }),
  }),
]);

export type RaidenState = t.TypeOf<typeof RaidenState>;

// helpers, utils & constants
// TODO: replace JSON functions with BigNumber-aware ones
export function encodeRaidenState(state: RaidenState): string {
  return JSON.stringify(RaidenState.encode(state), undefined, 2);
}

export function decodeRaidenState(data: unknown): RaidenState {
  if (typeof data === 'string') data = JSON.parse(data);
  const validationResult = RaidenState.decode(data);
  ThrowReporter.report(validationResult); // throws if decode failed
  return validationResult.value as RaidenState;
}

export const initialState: Readonly<RaidenState> = {
  address: '',
  blockNumber: 0,
  tokenNetworks: {},
  token2tokenNetwork: {},
};
