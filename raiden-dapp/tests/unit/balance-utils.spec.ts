import { BalanceUtils } from '@/utils/balance-utils';
import { BigNumber } from 'ethers/utils';
import { Token } from '@/model/types';

describe('BalanceUtils', () => {
  let token: Token = {
    address: '',
    balance: new BigNumber(0),
    decimals: 18,
    name: '',
    symbol: ''
  };

  test('returns true when the number of decimal places is greater than what the token supports', () => {
    expect(
      BalanceUtils.decimalsOverflow('0.000000000000000000001', token.decimals!)
    ).toBe(true);
  });

  test('return true when the number of decimal places is greater than what the token supports, and the integer part is non-zero', () => {
    expect(
      BalanceUtils.decimalsOverflow('1.000000000000000000001', token.decimals!)
    ).toBe(true);
  });

  test('returns false when the number of decimal places is greater than what the token supports', () => {
    expect(BalanceUtils.decimalsOverflow('0.00001', token.decimals!)).toBe(
      false
    );
  });

  test('returns false when the number of decimal places is greater than what the token supports, and the integer part is non-zero', () => {
    expect(BalanceUtils.decimalsOverflow('1.00001', token.decimals!)).toBe(
      false
    );
  });

  test('return false when the number is an integer', () => {
    expect(BalanceUtils.decimalsOverflow('100', token.decimals!)).toBe(false);
  });

  test('returns false when the number is zero', () => {
    expect(BalanceUtils.decimalsOverflow('0', token.decimals!)).toBe(false);
  });
});
