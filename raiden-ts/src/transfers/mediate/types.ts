/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber } from '@ethersproject/bignumber';
import { AddressZero, Zero } from '@ethersproject/constants';
import { Decimal } from 'decimal.js';
import * as t from 'io-ts';

import type { Channel } from '../../channels';
import { channelAmounts } from '../../channels/utils';
import { assert } from '../../utils';
import type { UInt, UnionToIntersection } from '../../utils/types';
import { Address, decode, Int, isntNil } from '../../utils/types';

type FeeFunc<BNIn extends Decimal | BigNumber, BNOut extends Decimal | BigNumber = BNIn> = (
  amount: BNIn,
) => BNOut;

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
   * Given (validated) config and a single channel, return a function to calculate this model's
   * fees for each incoming transfer amount
   *
   * @param config - Validated and decoded config by [decodeConfig]
   * @param channel - Channel state to calculate fee for
   * @returns Function which receives input amounts and returns fee
   */
  channelFee: (config: Config, channel: Channel) => FeeFunc<Decimal>;
  /**
   * Given (validated) config and pair of channels, return a function to calculate this model's
   * fees for each incoming transfer amount
   *
   * @param config - Validated and decoded config by [decodeConfig]
   * @param channelIn - Channel state where transfer got received
   * @param channelOut - Channel state where transfer is supposed to be forwarded through
   * @returns Function which receives input amounts and returns fee
   */
  fee: (config: Config, channelIn: Channel, channelOut: Channel) => FeeFunc<UInt<32>, Int<32>>;
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

const ZeroDec = new Decimal(0);
const OneDec = new Decimal(1);

/**
 * Parses a number and throws if it isn't a number or isn't an integer
 *
 * @param value - Something which can be parsed as a number
 * @returns integer
 */
function toInteger(value: unknown): number {
  const parsed = parseInt(value as any);
  assert(parsed !== undefined && parsed == value);
  return parsed;
}

/**
 * Creates a FeeFunc which can calculate the optimal fee based on the output capacity and input
 * and output fee functions
 *
 * @param outCapacity - Oown capacity of output channel
 * @param feeFuncs - Functions tuple
 * @param feeFuncs."0" - Input channel's fee function
 * @param feeFuncs."1" - Output channel's fee function
 * @returns FeeFunction which calculates best fee from input amounts
 */
function makeFeeFunctionFromAmountIn(
  outCapacity: Decimal,
  [inFeeFunc, outFeeFunc]: [FeeFunc<Decimal>, FeeFunc<Decimal>],
): FeeFunc<UInt<32>, Int<32>> {
  assert(outCapacity.gt(0), 'no output channel capacity available');

  return (amountIn_: UInt<32>) => {
    const amountIn = new Decimal(amountIn_.toHexString());
    const feeIn = inFeeFunc(amountIn);

    // https://raiden-network-specification.readthedocs.io/en/latest/mediation_fees.html#fee-calculation
    const func = (amountOut: Decimal) =>
      feeIn.add(outFeeFunc(amountOut.neg())).sub(amountIn).add(amountOut);

    let xA = ZeroDec;
    let fA = func(xA);
    assert(fA.lt(0), 'input transfer not enough to pay minimum fees');
    let xB = outCapacity;
    let fB = func(xB);
    assert(fB.gte(0), 'output capacity not enough to mediate transfer');
    // find interval containing root of monotonic func
    while (true) {
      const x = xB.add(xA).div(2);
      const fX = func(x);
      const slopeAX = fX.sub(fA).div(x.sub(xA));
      const slopeXB = fB.sub(fX).div(xB.sub(x));
      // once slope of both stretches are close enough (because Δx→dx or because it's
      // a piecewise linear function), we break and calculate the linear root of segment
      if (slopeXB.sub(slopeAX).abs().lt(0.000001)) break;
      // else, we contine with the stretch which contains the root (y of opposite signals)
      else if (fA.isNegative() !== fX.isNegative()) {
        xB = x;
        fB = fX;
      } else {
        xA = x;
        fA = fX;
      }
    }
    // calculate x where line [(xA, fA), (xB, fB)] crosses y=0:
    // x₀ = xA - yA/Δ, Δ=(yB-yA)/(xB-xA)
    const amountOut = xA.sub(fA.mul(xB.sub(xA)).div(fB.sub(fA)));
    // return fee = amountIn - amountOut
    return decode(Int(32), amountIn.sub(amountOut).toFixed(0, Decimal.ROUND_HALF_EVEN));
  };
}

export const flatFee: FeeModel<Int<32>, { flat: Int<32> }> = {
  name: 'flat',
  emptySchedule: { flat: Zero as Int<32> },
  decodeConfig(config, defaultConfig) {
    // flat config uses 'half' the per-token config, one half for each channel [in, out]
    return decode(Int(32), config ?? defaultConfig).div(2) as Int<32>;
  },
  channelFee(flat) {
    const flatFee = new Decimal(flat.toHexString());
    return () => flatFee;
  },
  fee(flat) {
    // flat fee just sums once for each channel
    const res = decode(Int(32), flat.mul(2));
    return () => res;
  },
  schedule(flat) {
    return { flat };
  },
};

export const proportionalFee: FeeModel<number, { proportional: Int<32> }> = {
  name: 'proportional',
  emptySchedule: { proportional: Zero as Int<32> },
  decodeConfig(config, defaultConfig) {
    // https://raiden-network-specification.readthedocs.io/en/latest/mediation_fees.html#converting-per-hop-proportional-fees-in-per-channel-proportional-fees
    // 1M is because config is received and returned as parts-per-million integers
    const perHopRatio = new Decimal(toInteger(config ?? defaultConfig)).div(1e6);
    const perChannelPPM = perHopRatio.div(perHopRatio.add(2)).mul(1e6);
    return perChannelPPM.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
  },
  channelFee(perChannelPPM) {
    const perChannelRatio = new Decimal(perChannelPPM).div(1e6);
    return (amount) => amount.mul(perChannelRatio).abs();
  },
  fee(perChannelPPM) {
    const perChannelRatio = new Decimal(perChannelPPM).div(1e6);
    return (amountIn_) => {
      const amountIn = new Decimal(amountIn_.toHexString());
      // for proportional fees only: xout = xin*(1-q)/(1+q)
      const amountOut = amountIn.mul(OneDec.sub(perChannelRatio).div(OneDec.add(perChannelRatio)));
      const fee = amountIn.sub(amountOut);
      return decode(Int(32), fee.toFixed(0, Decimal.ROUND_HALF_EVEN));
    };
  },
  schedule(perChannelPPM) {
    return { proportional: BigNumber.from(perChannelPPM) as Int<32> };
  },
};

type Point<N = BigNumber> = readonly [N, N];
type DiscreteFunc<N = BigNumber> = readonly Point<N>[];

/**
 * Creates an array of [count] BNs, starting with [start], ending with [end], and
 * intermediary values being the left edges for stretches (splits) of length differing at most 1.
 * Count must be greater than or equal 2 (start and end), and must be smaller or equal range width
 *
 * @param start - Start value
 * @param end - End value
 * @param count - Values count, which will divide range into [count - 1] stretches
 * @returns Sorted array of BNs of length [count]
 */
function linspace<N extends BigNumber = BigNumber>(start: N, end: N, count: number): readonly N[] {
  const width = end.sub(start);
  assert(count >= 2 && width.gte(count - 1), 'invalid linspace params');
  const ranges = count - 1;
  const step = new Decimal(width.toString()).div(ranges);
  const result: [N, ...N[]] = [start];
  for (let i = 1; i < ranges; i++) {
    result.push(start.add(step.mul(i).toFixed(0, Decimal.ROUND_HALF_EVEN)) as N);
  }
  return [...result, end];
}

/**
 * Finds the rightmost index for which arr[i] <= x < arr[i+1] (<= arr[arr.length-1])
 * Performs a binary search, with complexity O(log(N))
 * It first estimates a "good bet" of index if the func is equally spaced, then offsets it back or
 * forth until x is in between range
 *
 * @param x - Point to find index for
 * @param func - Discrete func
 * @returns Found index
 */
function findRangeIndex(x: Decimal, func: DiscreteFunc): number {
  assert(func.length >= 2, 'invalid linspace');
  const x0 = func[0][0];
  const xL = func[func.length - 1][0]; // x_last
  // special-case where x is exactly over xLast, make it part of last stretch instead of beyond it
  if (x.eq(xL.toHexString())) return func.length - 2;
  const width = new Decimal(xL.sub(x0).toHexString());
  const step = width.div(func.length - 1);

  let index = Math.floor(x.sub(x0.toHexString()).div(step).toNumber());
  let offs = 0;
  do {
    if (index < 0) return -1;
    else if (index >= func.length - 1) return func.length - 1;

    if (x.gte(func[index + 1][0].toHexString())) offs = -1;
    else if (x.lt(func[index][0].toHexString())) offs = 1;
    else offs = 0;

    index += offs;
  } while (offs);
  return index;
}

function interpolate(x: Decimal, [x0, y0]: Point, [x1, y1]: Point): Decimal {
  // y = f(x) = (x-x0)*Δy/Δx + y0
  return x
    .sub(x0.toHexString())
    .mul(y1.sub(y0).toHexString())
    .div(x1.sub(x0).toHexString())
    .add(y0.toHexString());
}

/**
 * Get the value of the piecewise linear curve described by the pairs in [arr] at point [x]
 *
 * @param x - Point where to get the value for
 * @param arr - function described as array of [x, y] pairs containing points linked by lines
 * @returns function value at point x
 */
function interpolateFunc(x: Decimal, arr: DiscreteFunc): Decimal {
  let index = findRangeIndex(x, arr);
  // in case index before|beyond arr limits, use first|last stretches
  if (index < 0) index = 0;
  else if (index >= arr.length - 1) index = arr.length - 2;
  return interpolate(x, arr[index], arr[index + 1]);
}

/**
 * Calculates pair of points discretizing a U-shaped curve which describes channel's imbalance fees
 * for a given total capacity and config.
 *
 * @param channelCapacity - Channel's total capacity (sum of deposits from both ends)
 * @param proportionalImbalanceFee - Fee config, in PPM (1% = 10,000)
 * @returns array of [x, y] pairs, where x is the old/new channel capacity and y is the fee
 */
function calculatePenaltyFunction(
  channelCapacity: UInt<32>,
  proportionalImbalanceFee: number,
): DiscreteFunc<UInt<32>> {
  const NUM_DISCRETISATION_POINTS = 21;
  const MAX_SLOPE = new Decimal('0.1');
  assert(channelCapacity.gt(0), 'not enough capacity');

  const channelCapacityDec = new Decimal(channelCapacity.toHexString());
  const numBasePoints = Decimal.min(
    NUM_DISCRETISATION_POINTS,
    channelCapacityDec.add(1),
  ).toNumber();
  const xValues = linspace(Zero as UInt<32>, channelCapacity, numBasePoints);

  if (proportionalImbalanceFee === 0) {
    return [
      [Zero as UInt<32>, Zero as UInt<32>],
      [channelCapacity as UInt<32>, Zero as UInt<32>],
    ];
  }
  const proportionalImbalanceFeeDec = new Decimal(proportionalImbalanceFee).div(1e6);

  assert(proportionalImbalanceFeeDec.lte(MAX_SLOPE.div(2)), 'Too high imbalance fee');

  const maxImbalanceFee = channelCapacityDec.mul(proportionalImbalanceFeeDec);

  const s = MAX_SLOPE;
  const c = maxImbalanceFee;
  const o = channelCapacityDec.div(2);
  const b = Decimal.min(10, s.mul(o).div(c));

  const func = (x: UInt<32>) =>
    BigNumber.from(
      new Decimal(x.toHexString())
        .sub(o)
        .abs()
        .pow(b)
        .mul(c)
        .div(o.pow(b))
        .toFixed(0, Decimal.ROUND_HALF_EVEN),
    ) as UInt<32>;
  return xValues.map((x) => [x, func(x)]);
}

export const imbalancePenaltyFee: FeeModel<
  number,
  { imbalance_penalty: DiscreteFunc<UInt<32>> | null }
> = {
  name: 'imbalance',
  emptySchedule: { imbalance_penalty: null },
  decodeConfig(config, defaultConfig) {
    const imbalancePPM = toInteger(config ?? defaultConfig);
    assert(imbalancePPM >= 0 && imbalancePPM <= 50_000, 'Too high imbalance fee');
    return imbalancePPM;
  },
  channelFee(imbalancePPM, channel) {
    const { totalCapacity, ownCapacity } = channelAmounts(channel);
    if (!imbalancePPM || !totalCapacity.gt(0)) return () => ZeroDec;
    const discreteFunc = calculatePenaltyFunction(totalCapacity, imbalancePPM);
    const ipAtCurCapacity = interpolateFunc(new Decimal(ownCapacity.toHexString()), discreteFunc);
    return (amount) =>
      interpolateFunc(amount.add(ownCapacity.toHexString()), discreteFunc).sub(ipAtCurCapacity);
  },
  fee(imbalancePPM, channelIn, channelOut) {
    const channelInFeeFunc = this.channelFee(imbalancePPM, channelIn);
    const channelOutFeeFunc = this.channelFee(imbalancePPM, channelOut);
    const outOwnCapacity = new Decimal(channelAmounts(channelOut).ownCapacity.toHexString());
    return makeFeeFunctionFromAmountIn(outOwnCapacity, [channelInFeeFunc, channelOutFeeFunc]);
  },
  schedule(imbalancePPM, channel) {
    const { totalCapacity } = channelAmounts(channel);
    if (!imbalancePPM || !totalCapacity.gt(0)) return { imbalance_penalty: null };
    const discreteFunc = calculatePenaltyFunction(totalCapacity, imbalancePPM);
    return { imbalance_penalty: discreteFunc };
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
  Models extends { [K: string]: FeeModel<any, Record<string, any>> },
>(models: Models) {
  type PerTokenConfig = { cap: boolean } & { [K in keyof Models]?: ConfigOf<Models[K]> };
  type UnifiedConfig = { readonly [token: string]: Readonly<PerTokenConfig> };
  type UnifiedSchedule = { cap_fees: boolean } & UnionToIntersection<
    ScheduleOf<Models[keyof Models]>
  >;
  const emptySchedule: UnifiedSchedule = Object.assign(
    { cap_fees: true },
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
        const perTokenConfig = { cap: config.cap ?? true } as PerTokenConfig;
        for (const [key_, model] of Object.entries<FeeModel<any, any>>(models)) {
          const key = key_ as keyof Models;
          if (!(key in config)) continue;
          perTokenConfig[key] = model.decodeConfig(config[key_]);
        }
        tokenConfigMap[token] = perTokenConfig;
      }
      return tokenConfigMap as UnifiedConfig;
    },
    channelFee(config, channel) {
      const tokenAddr = channel.token;
      const perTokenConfig: Readonly<PerTokenConfig> | undefined =
        config[tokenAddr] ?? config[AddressZero];
      const channelFeeFuncs = Object.entries(models)
        .map(([key, model]) => {
          const modelConfig = perTokenConfig?.[key as keyof Models];
          if (modelConfig) return model.channelFee(modelConfig, channel);
        })
        .filter(isntNil);
      return (amount) => channelFeeFuncs.reduce((fee, func) => fee.add(func(amount)), ZeroDec);
    },
    fee(config, channelIn, channelOut) {
      const channelInFeeFunc = this.channelFee(config, channelIn);
      const channelOutFeeFunc = this.channelFee(config, channelOut);
      const outOwnCapacity = new Decimal(channelAmounts(channelOut).ownCapacity.toHexString());
      const capFees =
        (config[channelIn.token] ?? config[AddressZero])?.cap ?? emptySchedule.cap_fees;
      const feeFunction = makeFeeFunctionFromAmountIn(outOwnCapacity, [
        channelInFeeFunc,
        channelOutFeeFunc,
      ]);

      return (amountIn) => {
        let fee = feeFunction(amountIn);
        if (capFees && fee.lt(0)) fee = Zero as Int<32>; // cap fee
        return fee;
      };
    },
    schedule(config, channel) {
      const tokenAddr = channel.token;
      const perTokenConfig: Readonly<PerTokenConfig> | undefined =
        config[tokenAddr] ?? config[AddressZero];
      return Object.assign(
        {},
        emptySchedule,
        perTokenConfig?.cap !== undefined ? { cap_fees: perTokenConfig.cap } : undefined,
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

export const standardCalculator = getStandardFeeCalculator({
  flat: flatFee,
  proportional: proportionalFee,
  imbalance: imbalancePenaltyFee,
});
// type StandardConfig = ConfigOf<typeof standardCalculator>;
// type StandardPerTokenConfig = StandardConfig[string];
// type StandardSchedule = ScheduleOf<typeof standardCalculator>;
