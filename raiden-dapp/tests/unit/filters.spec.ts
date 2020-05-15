import Filters from '@/filters';
import { BigNumber } from 'ethers/utils';
import { One, Zero } from 'ethers/constants';

describe('filters', () => {
  describe('truncate', () => {
    test('return the same value when its length is less than the truncation limit', () => {
      expect(Filters.truncate('123')).toEqual('123');
    });

    test('return the value truncated when it exceeds the truncation limit', () => {
      expect(Filters.truncate('12345678', 4)).toEqual('12...78');
    });
  });
  describe('decimals', () => {
    test('return a number formatted to 3 decimals', () => {
      expect(Filters.decimals('1.23444444')).toEqual('1.234');
    });
    test('return a number formatted to 2 decimals', () => {
      expect(Filters.decimals('1.23456789', 2)).toEqual('1.23');
    });
  });

  describe('upper', () => {
    test('return an empty string when the value is undefined', () => {
      expect(Filters.upper(undefined)).toEqual('');
    });

    test('return the text to uppercase', () => {
      expect(Filters.upper('aaaa')).toEqual('AAAA');
    });
  });

  describe('displayFormat', () => {
    test('displays 0 if 0 is passed without decimals', () => {
      expect(Filters.displayFormat(Zero, 0)).toEqual('0');
    });

    test('displays 1 if 1 is passed without decimals', () => {
      expect(Filters.displayFormat(One, 0)).toEqual('1');
    });

    test('return the number prefixed with "<" when the number is less than 0.000001', () => {
      expect(Filters.displayFormat(new BigNumber(10 ** 3), 18)).toEqual(
        '<0.000001'
      );
    });

    test('return the number prefixed with "≈" rounded at 6 decimal places', () => {
      expect(
        Filters.displayFormat(new BigNumber(1111110100000000), 18)
      ).toEqual('≈0.001111');
    });

    test('return the number formatted as it is when there are not enough non-zero decimal places', () => {
      expect(
        Filters.displayFormat(new BigNumber('11100000000000000000'), 18)
      ).toEqual('11.1');
    });

    test('return zero the number is zero', () => {
      expect(Filters.displayFormat(Zero, 18)).toEqual('0.0');
    });

    test('throw no exception when there are no decimal places specified ', () => {
      expect(
        Filters.displayFormat(new BigNumber('11100000000000000001'))
      ).toEqual('≈11.100000');
    });
  });

  describe('capitalizeFirst', () => {
    test('return the text with the first letter capitalized', () => {
      expect(Filters.capitalizeFirst('test')).toEqual('Test');
    });
  });

  describe('toUnits', () => {
    test('throw no exception when there are no decimal places specified', () => {
      expect(Filters.toUnits(new BigNumber('11100000000000000001'))).toEqual(
        '11.100000000000000001'
      );
    });
  });
});
