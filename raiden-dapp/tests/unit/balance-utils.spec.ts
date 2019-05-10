import { BalanceUtils } from '@/utils/balance-utils';
import { BigNumber } from 'ethers/utils';

describe('BalanceUtils', () => {
  let token = {
    address: '',
    balance: new BigNumber(0),
    decimals: 18,
    name: '',
    symbol: '',
    units: ''
  };

  it('should return true if the number of decimals is greater than the token supported', function() {
    expect(
      BalanceUtils.decimalsOverflow('0.000000000000000000001', token)
    ).toBe(true);
  });

  it('should return true if the number of decimals is greater than the token supported and the integer part is non-zero', function() {
    expect(
      BalanceUtils.decimalsOverflow('1.000000000000000000001', token)
    ).toBe(true);
  });

  it('should return false if the number of decimals is greater than the token supported', function() {
    expect(BalanceUtils.decimalsOverflow('0.00001', token)).toBe(false);
  });

  it('should return false if the number of decimals is greater than the token supported and the integer part is non-zero', function() {
    expect(BalanceUtils.decimalsOverflow('1.00001', token)).toBe(false);
  });

  it('should return false if the number (comma) of decimals is greater than the token supported and the integer part is non-zero', function() {
    expect(BalanceUtils.decimalsOverflow('1,00001', token)).toBe(false);
  });

  it('should return false if the number is integer', function() {
    expect(BalanceUtils.decimalsOverflow('100', token)).toBe(false);
  });

  it('should return false if the number is zero', function() {
    expect(BalanceUtils.decimalsOverflow('0', token)).toBe(false);
  });

  it('should return false if the deposit balance is greater than tha available balance', function() {
    expect(
      BalanceUtils.hasBalance('0.1', {
        units: '0.01',
        balance: BalanceUtils.parse('0.01', 18),
        decimals: 18,
        address: '0xtoken'
      })
    ).toBe(false);
  });

  it('should return true if the account balance is less than the available balance', function() {
    expect(
      BalanceUtils.hasBalance('0.001', {
        units: '0.01',
        balance: BalanceUtils.parse('0.01', 18),
        decimals: 18,
        address: '0xtoken'
      })
    ).toBe(true);
  });
});
