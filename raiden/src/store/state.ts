import * as t from 'io-ts';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import { AddressZero } from 'ethers/constants';

import { losslessParse, losslessStringify } from '../utils/data';
import { Address, Secret } from '../utils/types';
import { Channels } from '../channels';
import { RaidenMatrixSetup } from '../transport/state';

// types

export const RaidenState = t.type({
  address: Address,
  blockNumber: t.number,
  channels: Channels,
  tokens: t.record(t.string /* token: Address */, Address),
  transport: t.partial({
    matrix: t.intersection([
      t.type({
        server: t.string,
      }),
      t.partial({
        setup: RaidenMatrixSetup,
        rooms: t.record(t.string /* partner: Address */, t.array(t.string)),
      }),
    ]),
  }),
  secrets: t.record(
    t.string /* secrethash: Hash */,
    t.intersection([t.type({ secret: Secret }), t.partial({ registerBlock: t.number })]),
  ),
});

export type RaidenState = t.TypeOf<typeof RaidenState>;

// helpers, utils & constants

/**
 * Encode RaidenState to a JSON string
 * For Raiden client compliance, this JSON encodes BigNumbers as 'number' (using lossless-json lib)
 * which is valid json though not very common as common JS implementations lose precision when
 * decoding through JSON.parse. This is solved in SDK by both encoding and decoding BigNumbers
 * using lossless-json, without going through the intermediary JS-number form.
 * @param state RaidenState object
 * @returns JSON encoded string
 */
export function encodeRaidenState(state: RaidenState): string {
  return losslessStringify(RaidenState.encode(state), undefined, 2);
}

/**
 * Try to decode any data as a RaidenState.
 * If handled a string, will parse it with lossless-json, to preserve BigNumbers encoded as JSON
 * 'number'.
 * @param data string | any which may be decoded as RaidenState
 * @returns RaidenState parsed and validated
 */
export function decodeRaidenState(data: unknown): RaidenState {
  if (typeof data === 'string') data = losslessParse(data);
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
  secrets: {},
};
