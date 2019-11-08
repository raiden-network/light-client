import * as t from 'io-ts';
import { AddressZero } from 'ethers/constants';
import { DeepPartial } from 'redux';
import { Network, getNetwork } from 'ethers/utils';

import { RaidenConfig, makeDefaultConfig } from './config';
import { ContractsInfo } from './types';
import { losslessParse, losslessStringify } from './utils/data';
import { Address, Secret, decode } from './utils/types';
import { Channel } from './channels/state';
import { RaidenMatrixSetup } from './transport/state';
import { SentTransfers } from './transfers/state';
import { IOU } from './path/types';

// types

export const RaidenState = t.readonly(
  t.type({
    address: Address,
    chainId: t.number,
    registry: Address,
    blockNumber: t.number,
    config: RaidenConfig,
    channels: t.readonly(
      t.record(
        t.string /* tokenNetwork: Address */,
        t.readonly(t.record(t.string /* partner: Address */, Channel)),
      ),
    ),
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
    iou: t.readonly(
      t.record(
        t.string /* tokenNetwork: Address */,
        t.record(t.string /* service: Address */, IOU),
      ),
    ),
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
  return decode(RaidenState, data);
}

/**
 * Create an initial RaidenState from common parameters (including default config)
 *
 * @param obj - Object containing common parameters for state
 * @param obj.network - ether's Network object for the current blockchain
 * @param obj.address - current account's address
 * @param overwrites - A partial object to overwrite top-level properties of the returned config
 * @returns A full config object
 */
export function makeInitialState(
  {
    network,
    address,
    contractsInfo,
  }: { network: Network; address: Address; contractsInfo: ContractsInfo },
  overwrites: DeepPartial<RaidenState> = {},
): RaidenState {
  return {
    address,
    chainId: network.chainId,
    registry: contractsInfo.TokenNetworkRegistry.address,
    blockNumber: contractsInfo.TokenNetworkRegistry.block_number || 0,
    config: makeDefaultConfig({ network }, overwrites.config),
    channels: {},
    tokens: {},
    transport: {},
    secrets: {},
    sent: {},
    iou: {},
  };
}

/**
 * state constant used as default state reducer parameter only.
 * To build an actual initial state at runtime, use [[makeInitialState]] instead.
 */
export const initialState = makeInitialState({
  network: getNetwork('unspecified'),
  address: AddressZero as Address,
  contractsInfo: {
    // eslint-disable-next-line @typescript-eslint/camelcase
    TokenNetworkRegistry: { address: AddressZero as Address, block_number: 0 },
    // eslint-disable-next-line @typescript-eslint/camelcase
    ServiceRegistry: { address: AddressZero as Address, block_number: 0 },
    // eslint-disable-next-line @typescript-eslint/camelcase
    UserDeposit: { address: AddressZero as Address, block_number: 0 },
    // eslint-disable-next-line @typescript-eslint/camelcase
    OneToN: { address: AddressZero as Address, block_number: 0 },
  },
});
