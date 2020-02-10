import * as t from 'io-ts';
import { Network } from 'ethers/utils';

import { Address } from './utils/types';
import { getNetworkName } from './utils/ethers';

const logLevels = t.keyof({
  ['']: null,
  trace: null,
  debug: null,
  info: null,
  warn: null,
  error: null,
});

/**
 * A Raiden configuration object with required parameters and
 * optional parameters from [[PartialRaidenConfig]].
 *
 * - matrixServerLookup - Matrix server URL to fetch existing matrix servers from.
 *      After intializing a [[Raiden]] instance, the matrix server can't be changed later on.
 * - revealTimeout - Timeout for secrets to be revealed
 * - settleTimeout - Timeout for channels to be settled
 * - httpTimeout - Used in http fetch requests
 * - discoveryRoom - Discovery Room to auto-join, use null to disable
 * - pfsRoom - PFS Room to auto-join and send PFSCapacityUpdate to, use null to disable
 * - pfsSafetyMargin - Safety margin to be added to fees received from PFS. Use `1.1` to add a 10% safety margin.
 * - matrixExcessRooms - Keep this much rooms for a single user of interest (partner, target).
 *                       Leave LRU beyond this threshold.
 *   confirmationBlocks - How much blocks to wait before considering a transaction as confirmed
 * - matrixServer? - Specify a matrix server to use.
 * - logger? - String specifying the console log level of redux-logger. Use '' to disable.
 *             Defaults to 'debug' if undefined and process.env.NODE_ENV === 'development'
 * - pfs? - Path Finding Service URL or Address. Set to null to disable, or leave undefined to
 *          enable automatic fetching from ServiceRegistry.
 * - subkey? - When using subkey, this sets the behavior when { subkey } option isn't explicitly set
 *             in on-chain method calls. false (default) = use main key; true = use subkey
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
      pfsSafetyMargin: t.number,
      matrixExcessRooms: t.number,
      confirmationBlocks: t.number,
    }),
    t.partial({
      matrixServer: t.string,
      logger: t.union([
        logLevels,
        t.partial({
          prevState: logLevels,
          action: logLevels,
          error: logLevels,
          nextState: logLevels,
        }),
      ]),
      pfs: t.union([Address, t.string, t.null]),
      subkey: t.boolean,
    }),
  ]),
);
export interface RaidenConfig extends t.TypeOf<typeof RaidenConfig> {}

export const PartialRaidenConfig = t.readonly(
  t.intersection([t.partial(RaidenConfig.type.types['0'].props), RaidenConfig.type.types['1']]),
);
export interface PartialRaidenConfig extends t.TypeOf<typeof PartialRaidenConfig> {}

/**
 * Create a RaidenConfig from some common options
 *
 * @param obj - Object containing common parameters for config
 * @param obj.network - ether's Network object for the current blockchain
 * @returns A full config object
 */
export function makeDefaultConfig({ network }: { network: Network }): RaidenConfig {
  return {
    matrixServerLookup:
      'https://raw.githubusercontent.com/raiden-network/raiden-transport/master/known_servers.test.yaml',
    settleTimeout: 500,
    revealTimeout: 50,
    httpTimeout: 30e3,
    discoveryRoom: `raiden_${getNetworkName(network)}_discovery`,
    pfsRoom: `raiden_${getNetworkName(network)}_path_finding`,
    matrixExcessRooms: 3,
    pfsSafetyMargin: 1.0,
    confirmationBlocks: 5,
  };
}
