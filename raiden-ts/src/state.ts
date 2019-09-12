import * as t from 'io-ts';
import { isLeft } from 'fp-ts/lib/Either';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import { AddressZero } from 'ethers/constants';

import { losslessParse, losslessStringify } from './utils/data';
import { Address, Secret } from './utils/types';
import { Channels } from './channels/state';
import { RaidenMatrixSetup } from './transport/state';
import { SentTransfers } from './transfers/state';

// types

export const RaidenState = t.readonly(
  t.type({
    address: Address,
    chainId: t.number,
    registry: Address,
    blockNumber: t.number,
    channels: Channels,
    tokens: t.readonly(t.record(t.string /* token: Address */, Address)),
    transport: t.readonly(
      t.partial({
        matrix: t.readonly(
          t.intersection([
            t.type({
              server: t.string,
            }),
            t.partial({
              setup: RaidenMatrixSetup,
              rooms: t.readonly(t.record(t.string /* partner: Address */, t.array(t.string))),
            }),
          ]),
        ),
      }),
    ),
    secrets: t.readonly(
      t.record(
        t.string /* secrethash: Hash */,
        t.readonly(
          t.intersection([t.type({ secret: Secret }), t.partial({ registerBlock: t.number })]),
        ),
      ),
    ),
    sent: SentTransfers,
  }),
);

// the interface trick below forces TSC to use the imported type instead of inlining
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RaidenState extends t.TypeOf<typeof RaidenState> {}

// helpers, utils & constants

/**
 * Encode RaidenState to a JSON string
 * For Raiden client compliance, this JSON encodes BigNumbers as 'number' (using lossless-json lib)
 * which is valid json though not very common as common JS implementations lose precision when
 * decoding through JSON.parse. This is solved in SDK by both encoding and decoding BigNumbers
 * using lossless-json, without going through the intermediary JS-number form.
 *
 * @param state - RaidenState object
 * @returns JSON encoded string
 */
export function encodeRaidenState(state: RaidenState): string {
  return losslessStringify(RaidenState.encode(state), undefined, 2);
}

/**
 * Try to decode any data as a RaidenState.
 * If handled a string, will parse it with lossless-json, to preserve BigNumbers encoded as JSON
 * 'number'.
 *
 * @param data - string | any which may be decoded as RaidenState
 * @returns RaidenState parsed and validated
 */
export function decodeRaidenState(data: unknown): RaidenState {
  if (typeof data === 'string') data = losslessParse(data);
  const result = RaidenState.decode(data);
  if (isLeft(result)) throw ThrowReporter.report(result); // throws if decode failed
  return result.right;
}

export const initialState: RaidenState = {
  address: AddressZero as Address,
  chainId: 0,
  registry: AddressZero as Address,
  blockNumber: 0,
  channels: {},
  tokens: {},
  transport: {},
  secrets: {},
  sent: {},
};
