import * as t from 'io-ts';
import { Network } from 'ethers/utils';

import { Capabilities } from './constants';
import { Address } from './utils/types';
import { getNetworkName } from './utils/ethers';

/**
 * A Raiden configuration object with required and optional params from [[PartialRaidenConfig]].
 *
 * Notice partial/undefined values are special: when a raidenConfigUpdate is called with an
 * undefined value, it won't be set, as they can't be [re]stored in the JSON state, but instead
 * means it'll be *reset* to the default value; therefore, if a partial value has a defined
 * default, it can't be unset; if you want to support "empty" values, use null, empty string or
 * other falsy serializable types, and/or ensure it never gets a default
 *
 * - matrixServerLookup - Matrix server URL to fetch existing matrix servers from.
 *      After intializing a [[Raiden]] instance, the matrix server can't be changed later on.
 * - revealTimeout - Timeout for secrets to be revealed
 * - settleTimeout - Timeout for channels to be settled
 * - httpTimeout - Used in http fetch requests
 * - discoveryRoom - Discovery Room to auto-join, use null to disable
 * - pfsRoom - PFS Room to auto-join and send PFSCapacityUpdate to, use null to disable
 * - pfs - Path Finding Service URL or Address. Set to null to disable, or empty string to enable
 *         automatic fetching from ServiceRegistry.
 * - pfsSafetyMargin - Safety margin to be added to fees received from PFS. Use `1.1` to add a 10%
 *                     safety margin.
 * - matrixExcessRooms - Keep this much rooms for a single user of interest (partner, target).
 *                       Leave LRU beyond this threshold.
 * - confirmationBlocks - How many blocks to wait before considering a transaction as confirmed
 * - logger - String specifying the console log level of redux-logger. Use '' to silence.
 * - caps - Own transport capabilities
 * - matrixServer? - Specify a matrix server to use.
 * - subkey? - When using subkey, this sets the behavior when { subkey } option isn't explicitly
 *             set in on-chain method calls. false (default) = use main key; true = use subkey
 */
export const RaidenConfig = t.readonly(
  t.intersection([
    t.type({
      matrixServerLookup: t.string,
      revealTimeout: t.number,
      settleTimeout: t.number,
      httpTimeout: t.number,
      discoveryRoom: t.union([t.string, t.null]),
      pfsRoom: t.union([t.string, t.null]),
      pfs: t.union([Address, t.string, t.null]),
      pfsSafetyMargin: t.number,
      matrixExcessRooms: t.number,
      confirmationBlocks: t.number,
      logger: t.keyof({
        ['']: null, // silent/disabled
        trace: null,
        debug: null,
        info: null,
        warn: null,
        error: null,
      }),
      caps: t.readonly(t.record(t.string /* Capabilities */, t.any)),
    }),
    t.partial({
      matrixServer: t.string,
      subkey: t.boolean,
    }),
  ]),
);
export interface RaidenConfig extends t.TypeOf<typeof RaidenConfig> {}

export const PartialRaidenConfig = t.readonly(
  t.partial({ ...RaidenConfig.type.types['0'].props, ...RaidenConfig.type.types['1'].props }),
);
export interface PartialRaidenConfig extends t.TypeOf<typeof PartialRaidenConfig> {}

/**
 * Create a RaidenConfig from some common options
 *
 * @param obj - Object containing common parameters for config
 * @param obj.network - ether's Network object for the current blockchain
 * @param overwrites - Overwrites values from default config
 * @returns A full config object
 */
export function makeDefaultConfig(
  { network }: { network: Network },
  overwrites?: PartialRaidenConfig,
): RaidenConfig {
  return {
    matrixServerLookup:
      'https://raw.githubusercontent.com/raiden-network/raiden-transport/master/known_servers.test.yaml',
    settleTimeout: 500,
    revealTimeout: 50,
    httpTimeout: 30e3,
    discoveryRoom: `raiden_${getNetworkName(network)}_discovery`,
    pfsRoom: `raiden_${getNetworkName(network)}_path_finding`,
    pfs: '', // empty string = auto mode
    matrixExcessRooms: 3,
    pfsSafetyMargin: 1.0,
    confirmationBlocks: 5,
    logger: 'info',
    caps: {
      [Capabilities.NO_DELIVERY]: true,
      [Capabilities.NO_RECEIVE]: true,
      [Capabilities.NO_MEDIATE]: true,
      [Capabilities.WEBRTC]: true,
    },
    ...overwrites,
  };
}
