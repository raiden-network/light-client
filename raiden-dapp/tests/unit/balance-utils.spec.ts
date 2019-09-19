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

  it('should return true if the number of decimals is greater than the token supported', function() {
    expect(
      BalanceUtils.decimalsOverflow('0.000000000000000000001', token.decimals!)
    ).toBe(true);
  });

  it('should return true if the number of decimals is greater than the token supported and the integer part is non-zero', function() {
    expect(
      BalanceUtils.decimalsOverflow('1.000000000000000000001', token.decimals!)
    ).toBe(true);
  });

  it('should return false if the number of decimals is greater than the token supported', function() {
    expect(BalanceUtils.decimalsOverflow('0.00001', token.decimals!)).toBe(
      false
    );
  });

  it('should return false if the number of decimals is greater than the token supported and the integer part is non-zero', function() {
    expect(BalanceUtils.decimalsOverflow('1.00001', token.decimals!)).toBe(
      false
    );
  });

  it('should return false if the number (comma) of decimals is greater than the token supported and the integer part is non-zero', function() {
    expect(BalanceUtils.decimalsOverflow('1,00001', token.decimals!)).toBe(
      false
    );
  });

  it('should return false if the number is integer', function() {
    expect(BalanceUtils.decimalsOverflow('100', token.decimals!)).toBe(false);
  });

  it('should return false if the number is zero', function() {
    expect(BalanceUtils.decimalsOverflow('0', token.decimals!)).toBe(false);
  });
});
