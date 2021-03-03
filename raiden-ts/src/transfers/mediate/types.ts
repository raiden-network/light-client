/* eslint-disable @typescript-eslint/no-explicit-any */
import { AddressZero, Zero } from '@ethersproject/constants';
import * as t from 'io-ts';

import type { Channel } from '../../channels';
import type { UInt } from '../../utils/types';
import { Address, decode, Int } from '../../utils/types';

/**
 * Defines the interface for a fee model, which receives and validates a given config,
 * and calculates the fees for given config, channel state and input transfer amount.
 * Generics in this type are important:
 * - Config declares the configuration type expected for this specific feeModel component
 * - Schedule declares the type for the output of [schedule] member function, which should be an
 *    object to be merged with all other models and used as PFSFeeUpdate['fee_schedule'] payload
 */
export interface FeeModel<Config, Schedule> {
  /** name of the fee model */
  readonly name: string;
  readonly emptySchedule: Schedule;
  /**
   * Validates and decodes the config; throws if expected config schema doesn't fit
   *
   * @param config - any object/value to validate as config
   * @returns Decoded config, to be used in the other functions
   */
  decodeConfig: (config: unknown, defaultConfig?: unknown) => Config;
  /**
   * Given (validated) config and channel states, return a function to calculate this model's fees
   * for each incoming transfer amount
   *
   * @param config - Validated and decoded config by [decodeConfig]
   * @param channelIn - Channel state where transfer got received
   * @param channelOut - Channel state where transfer is supposed to be forwarded through
   * @returns Function which receives input amounts and returns fee
   */
  fee: (
    config: Config,
    channelIn: Channel,
    channelOut: Channel,
  ) => (amountIn: UInt<32>) => Int<32>;
  /**
   * Calculate this model's slice of the payload to PFSFeeUpdate messages
   *
   * @param config - Validated config
   * @param channel - Channel state to calculate FeeUpdate for
   * @returns A property of the fee_schedule member of [[PFSFeeUpdate]]
   */
  schedule: (config: Config, channel: Channel) => Schedule;
}

type ConfigOf<M extends FeeModel<any, any>> = ReturnType<M['decodeConfig']>;
type ScheduleOf<M extends FeeModel<any, any>> = M['emptySchedule'];

export const flatFee: FeeModel<Int<32>, { flat: Int<32> }> = {
  name: 'flat',
  emptySchedule: { flat: Zero as Int<32> },
  decodeConfig(config, defaultConfig) {
    // flat config uses 'half' the per-token config, one half for each channel [in, out]
    return decode(Int(32), config ?? defaultConfig).div(2) as Int<32>;
  },
  fee(flat) {
    return () => flat.mul(2) as Int<32>; // one for each side (channel)
  },
  schedule(flat) {
    return { flat };
  },
};

/**
 * Returns a standard mediation FeeModel which translates a per-token mapping of feeModels to a
 * model which validates each per-key config and calculates the fees sum
 *
 * Config is expected and decoded as being a indexed mapping object where keys are token addresses,
 * and values are objects containing optional config properties where keys are the models keys
 * passed as parameter and values are each FeeModel expected and validated config.
 * e.g.:
 * - models={ flat: flatFee<number> };
 * - expectedConfig={ [token: Address]: { flat: number } }
 *
 * Additionally, if an [AddressZero] token config is present, it'll be used as fallback/default
 * config in case the requested token isn't set.
 *
 * @param models - Models dict where [key] is that model's config name on the per-token config obj
 * @returns Standard Fee calculator
 */
export function getStandardFeeCalculator<
  Models extends { [K: string]: FeeModel<any, Record<string, any>> }
>(models: Models) {
  type PerTokenConfig = { [K in keyof Models]?: ConfigOf<Models[K]> };
  type UnifiedConfig = { readonly [token: string]: Readonly<PerTokenConfig> };
  type UnifiedSchedule = UnionToIntersection<ScheduleOf<Models[keyof Models]>>;
  const emptySchedule: UnifiedSchedule = Object.assign(
    {},
    ...Object.values(models).map((model) => model.emptySchedule),
  );
  const mapCodec = t.union([t.undefined, t.record(t.string, t.record(t.string, t.unknown))]);

  const standardCalculator: FeeModel<UnifiedConfig, UnifiedSchedule> = {
    name: 'standard',
    emptySchedule,
    decodeConfig(config, defaultConfig) {
      const tokenConfigMap = {
        ...decode(mapCodec, config),
        ...decode(mapCodec, defaultConfig),
      };
      for (const [token_, config] of Object.entries(tokenConfigMap)) {
        const token = decode(Address, token_);
        const perTokenConfig: PerTokenConfig = {};
        for (const [key_, model] of Object.entries<FeeModel<any, any>>(models)) {
          const key = key_ as keyof Models;
          if (!(key in config)) continue;
          perTokenConfig[key] = model.decodeConfig(config[key_]);
        }
        tokenConfigMap[token] = perTokenConfig;
      }
      return tokenConfigMap as UnifiedConfig;
    },
    fee(config, channelIn, channelOut) {
      const tokenAddr = channelIn.token;
      const perTokenConfig: Readonly<PerTokenConfig> | undefined =
        config[tokenAddr] ?? config[AddressZero];
      return (amountIn) => {
        return Object.entries<FeeModel<any, any>>(models).reduce((fee, [key_, model]) => {
          const key = key_ as keyof Models;
          const modelConfig = perTokenConfig?.[key];
          if (!modelConfig) return fee;
          return fee.add(model.fee(modelConfig, channelIn, channelOut)(amountIn));
        }, Zero) as Int<32>;
      };
    },
    schedule(config, channel) {
      const tokenAddr = channel.token;
      const perTokenConfig: Readonly<PerTokenConfig> | undefined =
        config[tokenAddr] ?? config[AddressZero];
      return Object.assign(
        {},
        ...Object.entries<FeeModel<any, any>>(models).map(([key_, model]) => {
          const key = key_ as keyof Models;
          const modelConfig = perTokenConfig?.[key];
          if (!modelConfig) return {};
          return model.schedule(modelConfig, channel);
        }),
      ) as UnifiedSchedule;
    },
  };
  return standardCalculator;
}

export const standardCalculator = getStandardFeeCalculator({ flat: flatFee });
// type StandardConfig = ConfigOf<typeof standardCalculator>;
// type StandardPerTokenConfig = StandardConfig[string];
// type StandardSchedule = ScheduleOf<typeof standardCalculator>;
