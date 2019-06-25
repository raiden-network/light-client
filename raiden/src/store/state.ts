import * as t from 'io-ts';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import { AddressZero } from 'ethers/constants';

import { Address } from '../utils/types';
import { Channels } from '../channels';
import { RaidenMatrixSetup } from '../transport/state';

// types

export const RaidenState = t.type({
  address: Address,
  blockNumber: t.number,
  channels: Channels,
  tokens: t.record(t.string, Address),
  transport: t.partial({
    matrix: t.intersection([
      t.type({
        server: t.string,
      }),
      t.partial({
        setup: RaidenMatrixSetup,
        rooms: t.record(t.string, t.array(t.string)),
      }),
    ]),
  }),
});

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
  address: AddressZero as Address,
  blockNumber: 0,
  channels: {},
  tokens: {},
  transport: {},
};
