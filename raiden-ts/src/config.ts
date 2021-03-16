import { MaxUint256 } from '@ethersproject/constants';
import type { Network } from '@ethersproject/networks';
import { parseEther } from '@ethersproject/units';
import * as t from 'io-ts';
import type { Observable } from 'rxjs';
import { first } from 'rxjs/operators';

import { Capabilities, DEFAULT_CONFIRMATIONS } from './constants';
import { PfsMode, PfsModeC } from './services/types';
import { exponentialBackoff } from './transfers/epics/utils';
import { Caps } from './transport/types';
import { getNetworkName } from './utils/ethers';
import { Address, UInt } from './utils/types';

const RTCIceServer = t.type({ urls: t.union([t.string, t.array(t.string)]) });

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
 *    After intializing a [[Raiden]] instance, the matrix server can't be changed later on.
 * - revealTimeout - Timeout for secrets to be revealed
 * - settleTimeout - Timeout for channels to be settled
 * - expiryFactor - Multiply revealTimeout to get how far in the future
 *    transfer expiration block should be
 * - httpTimeout - Used in http fetch requests
 * - discoveryRoom - Discovery Room to auto-join, use null to disable
 * - additionalServices - Array of extra services URLs (or addresses, if URL set on SecretRegistry)
 * - pfsMode - One of 'disabled' (disables PFS usage and notifications), 'auto' (notifies all of
 *    registered and additionalServices, picks cheapest for transfers without explicit pfs),
 *    or 'onlyAdditional' (notifies all, but pick first responding from additionalServices only).
 * - pfsRoom - PFS Room to auto-join and send PFSCapacityUpdate to, use null to disable
 * - monitoringRoom - MS global room to auto-join and send RequestMonitoring messages;
 *    use null to disable
 * - pfs - Array of Path Finding Service Addresses (require PFS to be registered) or URLs.
 *    Set to false to disable, or true to enable automatic fetching from ServiceRegistry.
 * - pfsSafetyMargin - Safety margin to be added to fees received from PFS. Either a fee
 *    multiplier, or a [fee, amount] pair ofmultipliers. Use `1.1` to add a 10% over estimated fee
 *    margin, or `[0.03, 0.0005]` to add a 3% over fee plus 0.05% over amount.
 * - pfsMaxPaths - Limit number of paths requested from PFS for a route.
 * - pfsMaxFee - Maximum fee we're willing to pay a PFS for a route (in SVT/RDN wei)
 * - pfsIouTimeout - Number of blocks to timeout an IOU to a PFS.
 * - confirmationBlocks - How many blocks to wait before considering a transaction as confirmed
 * - monitoringReward - Reward to be paid to MS, in SVT/RDN; use Zero or null to disable
 * - logger - String specifying the console log level of redux-logger. Use '' to silence.
 * - caps - Own transport capabilities overrides. Set to null to disable all, including defaults
 * - fallbackIceServers - STUN servers to be used as a fallback for WebRTC
 * - rateToSvt - Exchange rate between tokens and SVT, in wei: e.g. rate[TKN]=2e18 => 1TKN = 2SVT
 * - pollingInterval - Interval at which to poll ETH provider for new blocks/events (milliseconds)
 *    Honored only at start time
 * - minimumAllowance - Minimum value to call `approve` on tokens; default to MaxUint256, so
 *    approving tokens should be needed only once, trusting TokenNetwork's & UDC contracts;
 *    Set to Zero to fallback to approving the strictly needed deposit amounts
 * - autoSettle - Whether to channelSettle.request settleable channels automatically
 * - mediationFees - deps.mediationFeeCalculator config. It's typed as unknown because it'll be
 *     validated and decoded by [[FeeModel.decodeConfig]].
 * - matrixServer? - Specify a matrix server to use.
 * - subkey? - When using subkey, this sets the behavior when { subkey } option isn't explicitly
 *    set in on-chain method calls. false (default) = use main key; true = use subkey
 */
export const RaidenConfig = t.readonly(
  t.intersection([
    t.type({
      matrixServerLookup: t.string,
      revealTimeout: t.number,
      settleTimeout: t.number,
      expiryFactor: t.number, // must be > 1.0
      httpTimeout: t.number,
      discoveryRoom: t.union([t.string, t.null]),
      additionalServices: t.readonlyArray(t.union([Address, t.string])),
      pfsMode: PfsModeC,
      pfsRoom: t.union([t.string, t.null]),
      monitoringRoom: t.union([t.string, t.null]),
      pfsSafetyMargin: t.union([t.number, t.tuple([t.number, t.number])]),
      pfsMaxPaths: t.number,
      pfsMaxFee: UInt(32),
      pfsIouTimeout: t.number,
      confirmationBlocks: t.number,
      monitoringReward: t.union([t.null, UInt(32)]),
      logger: t.keyof({
        ['']: null, // silent/disabled
        trace: null,
        debug: null,
        info: null,
        warn: null,
        error: null,
      }),
      caps: t.union([t.null, Caps]),
      fallbackIceServers: t.array(RTCIceServer),
      rateToSvt: t.record(t.string, UInt(32)),
      pollingInterval: t.number,
      minimumAllowance: UInt(32),
      autoSettle: t.boolean,
      mediationFees: t.unknown,
    }),
    t.partial({
      matrixServer: t.string,
      subkey: t.boolean,
    }),
  ]),
);
export interface RaidenConfig extends t.TypeOf<typeof RaidenConfig> {}

export const PartialRaidenConfig = t.readonly(
  t.exact(
    t.partial({ ...RaidenConfig.type.types['0'].props, ...RaidenConfig.type.types['1'].props }),
  ),
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
  const networkName = getNetworkName(network);
  const matrixServerInfos =
    network.chainId === 1
      ? 'https://raw.githubusercontent.com/raiden-network/raiden-service-bundle/master/known_servers/known_servers-production-v1.2.0.json'
      : 'https://raw.githubusercontent.com/raiden-network/raiden-service-bundle/master/known_servers/known_servers-development-v1.2.0.json';

  // merge caps independently
  const caps =
    overwrites?.caps === null
      ? null
      : {
          [Capabilities.DELIVERY]: 0,
          [Capabilities.MEDIATE]: 0,
          [Capabilities.WEBRTC]: 1,
          [Capabilities.TO_DEVICE]: 1,
          ...overwrites?.caps,
        };
  return {
    matrixServerLookup: matrixServerInfos,
    settleTimeout: 500,
    revealTimeout: 50,
    expiryFactor: 1.1, // must be > 1.0
    httpTimeout: 30e3,
    discoveryRoom: `raiden_${networkName}_discovery`,
    additionalServices: [],
    pfsMode: PfsMode.auto,
    pfsRoom: `raiden_${networkName}_path_finding`,
    monitoringRoom: `raiden_${networkName}_monitoring`,
    pfsSafetyMargin: 1.0, // multiplier
    pfsMaxPaths: 3,
    pfsMaxFee: parseEther('0.05') as UInt<32>, // in SVT/RDN, 18 decimals
    pfsIouTimeout: 200000, // in blocks
    confirmationBlocks: DEFAULT_CONFIRMATIONS,
    // SVT also uses 18 decimals, like Ether, so parseEther works
    monitoringReward: parseEther('5') as UInt<32>,
    logger: 'info',
    fallbackIceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    rateToSvt: {},
    pollingInterval: 5000,
    minimumAllowance: MaxUint256 as UInt<32>,
    autoSettle: false,
    mediationFees: {},
    ...overwrites,
    caps, // merged caps overwrites 'overwrites.caps'
  };
}

/**
 * A function which returns an Iterable of intervals based on parameters in config$
 * By default, it returns an iterable which, on every iterator call, will return a new
 * exponentialBackoff iterator ranging from config.pollingInterval to 2 * config.httpTimeout
 *
 * @param config$ - Config-like observable, emiting objects with pollingInterval & httpTimeout
 * @returns Iterable (resettable) of intervals
 */
export function intervalFromConfig(
  config$: Observable<Pick<RaidenConfig, 'pollingInterval' | 'httpTimeout'>>,
): Iterable<number> & Iterator<number> {
  const self = {
    _iter: undefined as Iterator<number> | undefined,
    [Symbol.iterator]() {
      this._iter = undefined;
      return this;
    },
    next() {
      if (!this._iter) {
        let lowerInterval = 5e3;
        let upperInterval = 60e3;
        config$.pipe(first()).subscribe(({ pollingInterval, httpTimeout }) => {
          lowerInterval = pollingInterval;
          upperInterval = 2 * httpTimeout;
        });
        this._iter = exponentialBackoff(lowerInterval, upperInterval);
      }
      return this._iter.next();
    },
  };
  return self;
}
