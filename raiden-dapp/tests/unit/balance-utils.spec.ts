import { BigNumber, constants } from 'ethers';

import type { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';

describe('BalanceUtils', () => {
  const token: Token = {
    address: '',
    balance: BigNumber.from(0),
    decimals: 18,
    name: '',
    symbol: '',
  };

  test('return true when the number of decimal places is greater than what the token supports', () => {
    expect(BalanceUtils.decimalsOverflow('0.000000000000000000001', token.decimals!)).toBe(true);
  });

  test('return true when the number of decimal places is greater than what the token supports, and the integer part is non-zero', () => {
    expect(BalanceUtils.decimalsOverflow('1.000000000000000000001', token.decimals!)).toBe(true);
  });

  test('return false when the number of decimal places is greater than what the token supports', () => {
    expect(BalanceUtils.decimalsOverflow('0.00001', token.decimals!)).toBe(false);
  });

  test('return false when the number of decimal places is greater than what the token supports, and the integer part is non-zero', () => {
    expect(BalanceUtils.decimalsOverflow('1.00001', token.decimals!)).toBe(false);
  });

  test('return false when the number is an integer', () => {
    expect(BalanceUtils.decimalsOverflow('100', token.decimals!)).toBe(false);
  });

  test('return false when the number is zero', () => {
    expect(BalanceUtils.decimalsOverflow('0', token.decimals!)).toBe(false);
  });

  test('return only integer part if decimals are 0', () => {
    expect(BalanceUtils.toUnits(constants.One, 0)).toBe('1');
  });

  test('parse ignores trailing dot', () => {
    expect(BalanceUtils.parse('1.', 0)).toEqual(constants.One);
  });

  test('parsing maps error to zero', () => {
    expect(BalanceUtils.parse('0.001', 0)).toEqual(constants.Zero);
  });
});
