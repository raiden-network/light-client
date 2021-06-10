/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber } from '@ethersproject/bignumber';
import { AddressZero, One, Zero } from '@ethersproject/constants';

import type { Channel, ChannelEnd } from '@/channels/state';
import { ChannelState } from '@/channels/state';
import { BalanceProofZero } from '@/channels/types';
import { channelUniqueKey } from '@/channels/utils';
import { PFSFeeUpdate } from '@/messages';
import {
  flatFee,
  imbalancePenaltyFee,
  proportionalFee,
  standardCalculator,
} from '@/transfers/mediate/types';
import type { Address } from '@/utils/types';
import { decode, UInt } from '@/utils/types';

import { makeAddress } from '../utils';

const token = makeAddress();
const tokenNetwork = makeAddress();
const us = makeAddress();
const partnerIn = makeAddress();
const partnerOut = makeAddress();
const emptyChannelEnd: ChannelEnd = {
  address: AddressZero as Address,
  deposit: Zero as UInt<32>,
  withdraw: Zero as UInt<32>,
  locks: [],
  balanceProof: BalanceProofZero,
  pendingWithdraws: [],
  nextNonce: One as UInt<8>,
};
const channelIn: Channel = {
  _id: channelUniqueKey({ tokenNetwork, partner: partnerIn, id: 17 }),
  id: 17,
  settleTimeout: 500,
  tokenNetwork,
  token,
  state: ChannelState.open,
  isFirstParticipant: false,
  openBlock: 99,
  own: {
    ...emptyChannelEnd,
    address: us,
    deposit: Zero as UInt<32>,
  },
  partner: {
    ...emptyChannelEnd,
    address: partnerIn,
    deposit: BigNumber.from(100_000) as UInt<32>,
  },
};
const channelOut: Channel = {
  ...channelIn,
  _id: channelUniqueKey({ tokenNetwork, partner: partnerOut, id: 18 }),
  id: 18,
  own: {
    ...channelIn.own,
    deposit: BigNumber.from(100_000) as UInt<32>,
  },
  partner: {
    ...channelIn.partner,
    address: partnerOut,
    deposit: Zero as UInt<32>,
  },
};

test('flatFee', () => {
  expect(flatFee.name).toEqual('flat');
  expect(flatFee.emptySchedule).toEqual({ flat: Zero });
  const config = flatFee.decodeConfig('99');
  expect(config).toEqual(BigNumber.from(49));

  // although we've set config as 99, each half is rounded down, ending in an off-by-one error when
  // the config is odd; this is raiden-py's and PFS's behavior and we must comply
  expect(flatFee.fee(config, null as any, null as any)(decode(UInt(32), 1337))).toEqual(
    BigNumber.from(98),
  );

  expect(flatFee.schedule(config, null as any)).toEqual({ flat: config });
});

test('proportionalFee', () => {
  expect(proportionalFee.name).toEqual('proportional');
  expect(proportionalFee.emptySchedule).toEqual({ proportional: Zero });

  const config = proportionalFee.decodeConfig('10000'); // 1% = 0.01*1e6
  expect(config).toEqual(4975); // perChannel = perHop / (perHop + 2)
  expect(proportionalFee.schedule(config, null as any)).toEqual({
    proportional: BigNumber.from(4975),
  });
  expect(
    proportionalFee
      .fee(
        config,
        null as any,
        null as any,
      )(decode(UInt(32), 10213))
      .toNumber(),
  ).toBeWithin(100 - 1, 100 + 2); // from SP MFEE2 fee = 100±1

  const tests: [proportional: number, initial: number, expected: number][] = [
    [1_000_000, 2000, 1000],
    [100_000, 1100, 1000],
    [50_000, 1050, 1000],
    [10000, 1010, 1000],
    [10000, 101, 100],
    [4990, 100, 100],
  ];

  for (const [proportional, initial, expected] of tests) {
    expect([
      initial,
      initial -
        proportionalFee
          .fee(
            proportionalFee.decodeConfig(proportional),
            null as any,
            null as any,
          )(decode(UInt(32), initial))
          .toNumber(),
    ]).toEqual([initial, expected]);
  }
});

test('imbalancePenaltyFee', () => {
  function feeFuncToBigNumber(func: [number, number][]): [BigNumber, BigNumber][] {
    return func.map(([x, y]) => [BigNumber.from(x), BigNumber.from(y)]);
  }
  expect(imbalancePenaltyFee.schedule(imbalancePenaltyFee.decodeConfig(0), channelIn)).toEqual({
    imbalance_penalty: null,
  });

  expect(
    imbalancePenaltyFee.schedule(imbalancePenaltyFee.decodeConfig(10_000), {
      ...channelIn,
      partner: { ...channelIn.partner, deposit: BigNumber.from(5) as UInt<32> },
    }),
  ).toEqual({
    imbalance_penalty: feeFuncToBigNumber([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ]),
  });

  expect(
    imbalancePenaltyFee.schedule(imbalancePenaltyFee.decodeConfig(10_000), channelIn),
  ).toEqual({
    imbalance_penalty: feeFuncToBigNumber([
      [0, 1_000], // 10_000 ppm means 1% at the edges
      [5000, 590],
      [10000, 328],
      [15000, 168],
      [20000, 78],
      [25000, 31],
      [30000, 10],
      [35000, 2],
      [40000, 0],
      [45000, 0],
      [50000, 0],
      [55000, 0],
      [60000, 0],
      [65000, 2],
      [70000, 10],
      [75000, 31],
      [80000, 78],
      [85000, 168],
      [90000, 328],
      [95000, 590],
      [100_000, 1_000],
    ]),
  });

  expect(() =>
    imbalancePenaltyFee.fee(
      imbalancePenaltyFee.decodeConfig(10_000),
      channelIn,
      channelIn, // we dont have capacity in channelIn
    )(decode(UInt(32), 50_000)),
  ).toThrowError('no output channel capacity');

  expect(() =>
    imbalancePenaltyFee.fee(
      imbalancePenaltyFee.decodeConfig(10_000),
      channelIn,
      channelOut,
    )(decode(UInt(32), 110_000)),
  ).toThrowError('output capacity not enough');

  // values fetched from PC's tests/unit/transfer/mediated_transfer/test_mediation_fee.py
  const tests: [imbalance: number, initial: number, expected: number][] = [
    // No capping of the mediation fees
    // The higher the imbalance fee, the stronger the impact of the fee iteration
    [10_000, 50_000, 50_000 + 2_000],
    [20_000, 50_000, 50_000 + 3_995],
    [30_000, 50_000, 50_000 + 5_910],
    [40_000, 50_000, 50_000 + 7_613],
    [50_000, 50_000, 50_000 + 9_091],
  ];

  for (const [imbalance, initial, expected] of tests) {
    const fee = imbalancePenaltyFee
      .fee(
        imbalancePenaltyFee.decodeConfig(imbalance),
        channelIn,
        channelOut,
      )(decode(UInt(32), initial))
      .toNumber();
    expect(initial - fee).toEqual(expected);
  }
});

describe('standardCalculator', () => {
  test('flat + proportional', () => {
    // values fetched from PC's tests/unit/transfer/mediated_transfer/test_mediation_fee.py
    // only difference is double flat fee, because we halve it in the model instead of beforehand
    const tests: [flat: number, proportional: number, initial: number, expected: number][] = [
      // pure flat fee
      [100, 0, 1000, 1000 - 50 - 50],
      // proportional fee
      [0, 1_000_000, 2000, 1000], // 100% per hop mediation fee
      [0, 100_000, 1100, 1000], // 10% per hop mediation fee
      [0, 50_000, 1050, 1000], // 5% per hop mediation fee
      [0, 10_000, 1010, 1000], // 1% per hop mediation fee
      [0, 10_000, 101, 100], // 1% per hop mediation fee
      [0, 4_990, 100, 100], // 0,499% per hop mediation fee gets rounded away
      // mixed tests
      [2, 500_000, 1000 + 500 + 2, 1000],
      [20, 500_000, 1000 + 500 + 20, 997],
      [200, 500_000, 1000 + 500 + 200, 967],
      // -
      [2, 100_000, 1000 + 100 + 2, 1000],
      [20, 100_000, 1000 + 100 + 20, 999],
      [200, 100_000, 1000 + 100 + 200, 991],
      // -
      [2, 10_000, 1000 + 10 + 2, 1000],
      [20, 10_000, 1000 + 10 + 20, 1000],
      [200, 10_000, 1000 + 10 + 200, 999],
      // -
      [200, 500_000, 1000 + 750, 1000],
      // - values found in run_test_mediated_transfer_with_fees
      [0, 200_000, 47 + 9, 47],
      [0, 200_000, 39 + 8, 39],
    ];

    for (const [flat, proportional, initial, expected] of tests) {
      const fee = standardCalculator
        .fee(
          standardCalculator.decodeConfig({ [token]: { flat, proportional } }),
          channelIn,
          channelOut,
        )(decode(UInt(32), initial))
        .toNumber();
      expect(initial - fee).toEqual(expected);
    }
  });

  test('imbalance & cap', () => {
    // values fetched from PC's tests/unit/transfer/mediated_transfer/test_mediation_fee.py
    const tests: [cap: boolean, imbalance: number, initial: number, expected: number][] = [
      // No capping of the mediation fees
      // The higher the imbalance fee, the stronger the impact of the fee iteration
      [false, 10_000, 50_000, 50_000 + 2_000],
      [false, 20_000, 50_000, 50_000 + 3_995],
      [false, 30_000, 50_000, 50_000 + 5_910],
      [false, 40_000, 50_000, 50_000 + 7_613],
      [false, 50_000, 50_000, 50_000 + 9_091],
      // Capping of mediation fees
      [true, 10_000, 50_000, 50_000],
      [true, 20_000, 50_000, 50_000],
      [true, 30_000, 50_000, 50_000],
      [true, 40_000, 50_000, 50_000],
      [true, 50_000, 50_000, 50_000],
    ];

    for (const [cap, imbalance, initial, expected] of tests) {
      const fee = standardCalculator
        .fee(
          standardCalculator.decodeConfig({ [token]: { cap, imbalance } }),
          channelIn,
          channelOut,
        )(decode(UInt(32), initial))
        .toNumber();
      expect(initial - fee).toEqual(expected);
    }
  });

  // failing until https://github.com/raiden-network/raiden/issues/7130 is fixed
  test.skip('combined big curve & fee_schedule encode', () => {
    const channel = {
      ...channelIn,
      own: {
        ...channelIn.own,
        deposit: BigNumber.from('1000000000000000000') as UInt<32>,
      },
      partner: {
        ...channelIn.partner,
        deposit: BigNumber.from('1000000000000000000') as UInt<32>,
      },
    };
    const schedule = standardCalculator.schedule(
      standardCalculator.decodeConfig({
        [channel.token]: { cap: false, flat: '100', proportional: '10000', imbalance: '20000' },
      }),
      channel,
    );
    // "real life" values fetched from MFEE4
    expect((PFSFeeUpdate as any).type.props.fee_schedule.encode(schedule)).toEqual({
      flat: '50',
      imbalance_penalty: [
        ['0', '40000000000000000'],
        ['100000000000000000', '30737338856836652'],
        ['200000000000000000', '22897336089597848'],
        ['300000000000000000', '16398536520067884'],
        ['400000000000000000', '11154192037077362'],
        ['500000000000000000', '7071067811865476'],
        ['600000000000000000', '4047715405015526'],
        ['700000000000000000', '1971801207018598'],
        ['800000000000000000', '715541752799933'],
        ['900000000000000000', '126491106406735'],
        ['1000000000000000000', '0'],
        ['1100000000000000000', '126491106406735'],
        ['1200000000000000000', '715541752799933'],
        ['1300000000000000000', '1971801207018598'],
        ['1400000000000000000', '4047715405015526'],
        ['1500000000000000000', '7071067811865476'],
        ['1600000000000000000', '11154192037077362'],
        ['1700000000000000000', '16398536520067884'],
        ['1800000000000000000', '22897336089597848'],
        ['1900000000000000000', '30737338856836652'],
        ['2000000000000000000', '40000000000000000'],
      ],
      cap_fees: false,
      proportional: '4975',
    });
  });
});
