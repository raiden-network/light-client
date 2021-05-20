/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber } from '@ethersproject/bignumber';
import { Zero } from '@ethersproject/constants';

import { flatFee, proportionalFee } from '@/transfers/mediate/types';
import { decode, UInt } from '@/utils/types';

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
  expect(config).toEqual(BigNumber.from(4975)); // perChannel = perHop / (perHop + 2)
  expect(proportionalFee.schedule(config, null as any)).toEqual({ proportional: config });
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
