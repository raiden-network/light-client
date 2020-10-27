/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import { AddressZero } from '@ethersproject/constants';
import { Network, getNetwork } from '@ethersproject/networks';

import { PartialRaidenConfig } from './config';
import { ContractsInfo } from './types';
import { ConfirmableAction } from './actions';
import { Address, Signed } from './utils/types';
import { ChannelKey } from './channels/types';
import { Channel } from './channels/state';
import { RaidenMatrixSetup } from './transport/state';
import { IOU } from './services/types';
import { TransferState } from './transfers/state';

// types
const _RaidenState = t.readonly(
  t.type({
    address: Address,
    chainId: t.number,
    registry: Address,
    blockNumber: t.number,
    config: PartialRaidenConfig,
    channels: t.readonly(t.record(ChannelKey, Channel)),
    oldChannels: t.readonly(t.record(t.string, Channel)),
    tokens: t.readonly(t.record(t.string /* token: Address */, Address)),
    transport: t.readonly(
      t.partial({
        server: t.string,
        setup: RaidenMatrixSetup,
        rooms: t.readonly(t.record(t.string /* partner: Address */, t.array(t.string))),
      }),
    ),
    transfers: t.readonly(t.record(t.string /*: key: TransferKey */, TransferState)),
    iou: t.readonly(
      t.record(
        t.string /* tokenNetwork: Address */,
        t.record(t.string /* service: Address */, Signed(IOU)),
      ),
    ),
    pendingTxs: t.readonlyArray(ConfirmableAction),
  }),
  'RaidenState',
);

// the interface trick below forces TSC to use the imported type instead of inlining
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RaidenState extends t.TypeOf<typeof _RaidenState> {}
export interface RaidenStateC extends t.Type<RaidenState, t.OutputOf<typeof _RaidenState>> {}
export const RaidenState: RaidenStateC = _RaidenState;

// helpers, utils & constants

// Partial<RaidenState> which allows 2nd-level config: PartialRaidenConfig
type PartialState = { config?: PartialRaidenConfig } & Omit<Partial<RaidenState>, 'config'>;

/**
 * Create an initial RaidenState from common parameters (including default config)
 *
 * @param obj - Object containing common parameters for state
 * @param obj.network - ether's Network object for the current blockchain
 * @param obj.address - current account's address
 * @param obj.contractsInfo - ContractsInfo mapping
 * @param overrides - A partial object to overwrite top-level properties of the returned config
 * @returns A full config object
 */
export function makeInitialState(
  {
    network,
    address,
    contractsInfo,
  }: { network: Network; address: Address; contractsInfo: ContractsInfo },
  overrides: PartialState = {},
): RaidenState {
  return {
    address,
    chainId: network.chainId,
    registry: contractsInfo.TokenNetworkRegistry.address,
    blockNumber: contractsInfo.TokenNetworkRegistry.block_number,
    channels: {},
    oldChannels: {},
    tokens: {},
    transport: {},
    transfers: {},
    iou: {},
    pendingTxs: [],
    config: {},
    ...overrides,
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
    MonitoringService: { address: AddressZero as Address, block_number: 0 },
    OneToN: { address: AddressZero as Address, block_number: 0 },
  },
});
