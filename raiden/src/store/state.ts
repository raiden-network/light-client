import * as t from 'io-ts';
import { ThrowReporter } from 'io-ts/lib/ThrowReporter';
import { AddressZero } from 'ethers/constants';
import { parse, stringify, LosslessNumber } from 'lossless-json';

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
  return stringify(RaidenState.encode(state), undefined, 2);
}

const isLosslessNumber = (u: unknown): u is LosslessNumber =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  u && (u as any)['isLosslessNumber'] === true;
/**
 * Try to decode any data as a RaidenState.
 * If handled a string, will parse it with lossless-json, to preserve BigNumbers encoded as JSON
 * 'number'.
 * @param data string | any which may be decoded as RaidenState
 * @returns RaidenState parsed and validated
 */
export function decodeRaidenState(data: unknown): RaidenState {
  if (typeof data === 'string')
    data = parse(data, ({}, value) => {
      if (isLosslessNumber(value)) {
        try {
          return value.valueOf(); // return number, if possible, or throw if > 2^53
        } catch (e) {} // else, pass to return LosslessNumber, which can be decoded by BigNumberC
      }
      return value;
    });
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
