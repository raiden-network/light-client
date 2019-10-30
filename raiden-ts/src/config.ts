import * as t from 'io-ts';
import { Network } from 'ethers/utils';
import { DeepPartial } from 'redux';
import { Address } from './utils/types';

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
 * - matrixServer? - Specify a matrix server to use.
 * - logger? - String specifying the console log level of redux-logger. Use '' to disable.
 *             Defaults to 'debug' if undefined and process.env.NODE_ENV === 'development'
 * - pfs - Path Finding Service URL or Address. Set to null to disable, or leave undefined to
 *             enable automatic fetching from ServiceRegistry.
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
    }),
    t.partial({
      matrixServer: t.string,
      logger: t.keyof({ ['']: null, debug: null, log: null, info: null, warn: null, error: null }),
      pfs: t.union([Address, t.string, t.null]),
    }),
  ]),
);
export interface RaidenConfig extends t.TypeOf<typeof RaidenConfig> {}

/**
 * Create a RaidenConfig from some common options and an optional overwrites partial
 *
 * @param obj - Object containing common parameters for config
 * @param obj.network - ether's Network object for the current blockchain
 * @param overwrites - A partial object to overwrite top-level properties of the returned config
 * @returns A full config object
 */
export function makeDefaultConfig(
  { network }: { network: Network },
  overwrites: DeepPartial<RaidenConfig> = {},
): RaidenConfig {
  return {
    matrixServerLookup:
      'https://raw.githubusercontent.com/raiden-network/raiden-transport/master/known_servers.test.yaml',
    settleTimeout: 500,
    revealTimeout: 50,
    httpTimeout: 30e3,
    discoveryRoom: `raiden_${
      network.name !== 'unknown' ? network.name : network.chainId
    }_discovery`,
    pfsRoom: `raiden_${network.name !== 'unknown' ? network.name : network.chainId}_path_finding`,
    matrixExcessRooms: 3,
    pfsSafetyMargin: 1.0,
    ...overwrites,
  };
}
