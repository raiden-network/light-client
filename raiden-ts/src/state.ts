import * as t from 'io-ts';
import { AddressZero } from 'ethers/constants';
import { Network, getNetwork } from 'ethers/utils';
import { debounce, merge as _merge } from 'lodash';

import { PartialRaidenConfig } from './config';
import { ContractsInfo } from './types';
import { losslessParse, losslessStringify } from './utils/data';
import { Address, Secret, decode, Signed, Storage } from './utils/types';
import { Channel } from './channels/state';
import { RaidenMatrixSetup } from './transport/state';
import { SentTransfers } from './transfers/state';
import { IOU } from './path/types';
import { getNetworkName } from './utils/ethers';

// types

export const RaidenState = t.readonly(
  t.type({
    address: Address,
    chainId: t.number,
    registry: Address,
    blockNumber: t.number,
    config: PartialRaidenConfig,
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
    path: t.type({
      iou: t.readonly(
        t.record(
          t.string /* tokenNetwork: Address */,
          t.record(t.string /* service: Address */, Signed(IOU)),
        ),
      ),
    }),
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

// Partial<RaidenState> which allows 2nd-level config: PartialRaidenConfig
type PartialState = { config?: PartialRaidenConfig } & Omit<Partial<RaidenState>, 'config'>;

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
  overwrites: PartialState = {},
): RaidenState {
  return {
    address,
    chainId: network.chainId,
    registry: contractsInfo.TokenNetworkRegistry.address,
    blockNumber: contractsInfo.TokenNetworkRegistry.block_number,
    config: overwrites.config ?? {},
    channels: {},
    tokens: {},
    transport: {},
    secrets: {},
    sent: {},
    path: {
      iou: {},
    },
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
  },
});

/**
 * Checks whether `storageOrState` is [[Storage]]
 *
 * @param storageOrState - either state or [[Storage]]
 * @returns true if storageOrState is [[Storage]]
 */
const isStorage = (storageOrState: unknown): storageOrState is Storage =>
  storageOrState && typeof (storageOrState as Storage).getItem === 'function';

/**
 * Loads state from `storageOrState`. Returns the initial [[RaidenState]] if
 * `storageOrState` does not exist.
 *
 * @param network - current network
 * @param contracts - current contracts
 * @param address - current address of the signer
 * @param storageOrState - either [[Storage]] or [[RaidenState]]
 * @param config - raiden config
 * @returns true if storageOrState is [[Storage]]
 */
export const getState = async (
  network: Network,
  contracts: ContractsInfo,
  address: Address,
  storageOrState?: unknown,
  config?: PartialRaidenConfig,
): Promise<{
  state: RaidenState;
  onState?: (state: RaidenState) => void;
  onStateComplete?: () => void;
}> => {
  let loadedState = makeInitialState({ network, address, contractsInfo: contracts }, { config });
  let onState;
  let onStateComplete;

  if (storageOrState && isStorage(storageOrState)) {
    const ns = `raiden_${getNetworkName(network)}_${
      contracts.TokenNetworkRegistry.address
    }_${address}`;
    const loaded = _merge(
      {},
      loadedState,
      losslessParse((await storageOrState.getItem(ns)) || 'null'),
    );

    loadedState = decodeRaidenState(loaded);

    // to be subscribed on raiden.state$
    const debouncedState = debounce(
      (state: RaidenState): void => {
        storageOrState.setItem(ns, encodeRaidenState(state));
      },
      1000,
      { maxWait: 5000 },
    );
    onState = debouncedState;
    onStateComplete = () => debouncedState.flush();
  } else if (storageOrState && RaidenState.is(storageOrState)) {
    loadedState = storageOrState;
  } else if (storageOrState) {
    loadedState = decodeRaidenState(storageOrState);
  }

  return { state: loadedState, onState, onStateComplete };
};
