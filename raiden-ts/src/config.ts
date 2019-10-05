import * as t from 'io-ts';

/**
 * A Raiden configuration object with required parameters and
 * optional parameters from [[PartialRaidenConfig]].
 *
 * - matrixServerLookup - Matrix server URL to fetch existing matrix servers from.
 *      After intializing a [[Raiden]] instance, the matrix server can't be changed later on.
 * - revealTimeout - Timeout for secrets to be revealed
 * - settleTimeout - Timeout for channels to be settled
 * - httpTimeout - Used in http fetch requests
 * - pfs - Path Finding Service URL, set to null to disable
 * - discoveryRoom - Discovery Room to auto-join, use null to disable
 * - pfsRoom - PFS Room to auto-join and send PFSCapacityUpdate to, use null to disable
 * - matrixExcessRooms - Keep this much rooms for a single user of interest (partner, target).
 *                       Leave LRU beyond this threshold.
 * - matrixServer? - Specify a matrix server to use.
 * - logger? - String specifying the console log level of redux-logger. Use '' to disable.
 *             Defaults to 'debug' if undefined and process.env.NODE_ENV === 'development'
 */
export const RaidenConfig = t.readonly(
  t.intersection([
    t.type({
      matrixServerLookup: t.string,
      revealTimeout: t.number,
      settleTimeout: t.number,
      httpTimeout: t.number,
      pfs: t.union([t.string, t.null]),
      discoveryRoom: t.union([t.string, t.null]),
      pfsRoom: t.union([t.string, t.null]),
      matrixExcessRooms: t.number,
    }),
    t.partial({
      matrixServer: t.string,
      logger: t.keyof({ ['']: null, debug: null, log: null, info: null, warn: null, error: null }),
    }),
  ]),
);
export interface RaidenConfig extends t.TypeOf<typeof RaidenConfig> {}

export const defaultConfig: {
  [network: string]: Partial<RaidenConfig>;
  default: RaidenConfig;
} = {
  goerli: {
    pfs: 'https://pfs-goerli.services-dev.raiden.network',
  },
  ropsten: {
    pfs: 'https://pfs-ropsten.services-dev.raiden.network',
  },
  kovan: {
    pfs: 'https://pfs-kovan.services-dev.raiden.network',
  },
  rinkeby: {
    pfs: 'https://pfs-rinkeby.services-dev.raiden.network',
  },
  default: {
    matrixServerLookup:
      'https://raw.githubusercontent.com/raiden-network/raiden-transport/master/known_servers.test.yaml',
    settleTimeout: 500,
    revealTimeout: 50,
    httpTimeout: 30e3,
    pfs: null,
    discoveryRoom: null,
    pfsRoom: null,
    matrixExcessRooms: 3,
  },
};
