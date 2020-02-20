/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/camelcase */
import * as t from 'io-ts';
import { AddressZero } from 'ethers/constants';
import { Network, getNetwork } from 'ethers/utils';
import { debounce } from 'lodash';
import logging from 'loglevel';

import { PartialRaidenConfig } from './config';
import { ContractsInfo } from './types';
import { ConfirmableAction } from './actions';
import migrateState from './migration';
import { losslessParse, losslessStringify } from './utils/data';
import { Address, Secret, Signed, Storage, decode } from './utils/types';
import { Channel } from './channels/state';
import { RaidenMatrixSetup } from './transport/state';
import { SentTransfers } from './transfers/state';
import { IOU } from './path/types';
import { getNetworkName } from './utils/ethers';
import RaidenError, { ErrorCodes } from './utils/error';

// same as highest migrator function in migration.index.migrators
export const CURRENT_STATE_VERSION = 0;

// types
export const RaidenState = t.readonly(
  t.type({
    address: Address,
    version: t.literal(CURRENT_STATE_VERSION),
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
    pendingTxs: t.readonlyArray(ConfirmableAction),
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
 * Try to migrate & decode data as RaidenState.
 * If handled a string, will parse it with lossless-json, to preserve BigNumbers encoded as JSON
 * 'number'. The data may be migrated from previous versions, then validated as current RaidenState
 *
 * @param data - string | any which may be decoded as RaidenState
 * @returns RaidenState parsed, migrated and validated
 */
export function decodeRaidenState(
  data: unknown,
  { log }: { log: logging.Logger } = { log: logging },
): RaidenState {
  if (typeof data === 'string') data = losslessParse(data);
  const state = migrateState(data, { log });
  // validates and returns as current state
  try {
    return decode(RaidenState, state);
  } catch (err) {
    log.error(`Error validating migrated state version=${state?.version}`, state);
    throw err;
  }
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
    version: CURRENT_STATE_VERSION,
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
    pendingTxs: [],
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
    TokenNetworkRegistry: { address: AddressZero as Address, block_number: 0 },
    ServiceRegistry: { address: AddressZero as Address, block_number: 0 },
    UserDeposit: { address: AddressZero as Address, block_number: 0 },
    SecretRegistry: { address: AddressZero as Address, block_number: 0 },
  },
});

/**
 * Checks whether `storageOrState` is [[Storage]]
 *
 * @param storage - either state or [[Storage]]
 * @returns true if storageOrState is [[Storage]]
 */
const isStorage = (storage: unknown): storage is Storage =>
  storage && typeof (storage as Storage).getItem === 'function';

/**
 * Loads state from `storageOrState`. Returns the initial [[RaidenState]] if
 * `storageOrState` does not exist.
 *
 * @param network - current network
 * @param contracts - current contracts
 * @param address - current address of the signer
 * @param storageOrState - either [[Storage]] or [[RaidenState]] or
 *        { storage: [[Storage]]; state?: [[RaidenState]] }
 * @param config - raiden config
 * @returns true if storageOrState is [[Storage]]
 */
export const getState = async (
  network: Network,
  contracts: ContractsInfo,
  address: Address,
  storageOrState?: any,
  config?: PartialRaidenConfig,
): Promise<{
  state: RaidenState;
  onState?: (state: RaidenState) => void;
  onStateComplete?: () => void;
}> => {
  const log = logging.getLogger(`raiden:${address}`);
  let onState;
  let onStateComplete;

  let storage: Storage | undefined;
  let providedState: any;

  if (isStorage(storageOrState)) {
    // stateOrStorage is storage
    storage = storageOrState;
    providedState = undefined;
  } else if (isStorage(storageOrState?.storage)) {
    // stateOrStorage is in the format { storage: Storage; state?: RaidenState | unknown }
    storage = storageOrState.storage;
    providedState = storageOrState.state;
  } else {
    // stateOrStorage is state, no storage provided
    storage = undefined;
    providedState = storageOrState;
  }

  let state: RaidenState | undefined = undefined;
  if (providedState) {
    state = decodeRaidenState(providedState, { log });
  }

  if (storage) {
    const ns = `raiden_${getNetworkName(network)}_${
      contracts.TokenNetworkRegistry.address
    }_${address}`;
    const storedData = await storage.getItem(ns);

    if (storedData) {
      const storedState = decodeRaidenState(storedData, { log });
      if (state /* provided */) {
        // if both stored & provided state, ensure we weren't handed an older one!
        if (state.blockNumber < storedState.blockNumber) {
          throw new RaidenError(ErrorCodes.RDN_STATE_MIGRATION, {
            storedStateBlockNumber: storedState.blockNumber,
            providedStateBlockNumber: state.blockNumber,
          });
        } else {
          log.warn(
            `Replacing stored state @blockNumber=${storedState.blockNumber} with newer provided state @blockNumber=${state.blockNumber}`,
          );
        }
      } else {
        // no provided state but there's a stored one, use it
        state = storedState;
      }
    } // else, no stored state, initialize a new one below, if needed

    // to be subscribed on raiden.state$
    const debouncedState = debounce(
      (state: RaidenState): void => {
        storage!.setItem(ns, encodeRaidenState(state));
      },
      1000,
      { maxWait: 5000 },
    );
    onState = debouncedState;
    onStateComplete = () => debouncedState.flush();
  }

  // if no provided nor stored state, initialize a pristine one
  if (!state) state = makeInitialState({ network, address, contractsInfo: contracts }, { config });

  return { state, onState, onStateComplete };
};
