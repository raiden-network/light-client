import Filters from '@/filters';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';

describe('filters', () => {
  describe('truncate', () => {
    test('should return the same value if it is smaller than', () => {
      expect(Filters.truncate('123')).toEqual('123');
    });

    test('should return the value truncated', () => {
      expect(Filters.truncate('12345678', 4)).toEqual('12...78');
    });
  });
  describe('decimals', () => {
    test('should return a number formatted to 3 decimals', () => {
      expect(Filters.decimals('1.23444444')).toEqual('1.234');
    });
    test('should return a number formatted to 2 decimals', () => {
      expect(Filters.decimals('1.23456789', 2)).toEqual('1.23');
    });
  });

  describe('upper', () => {
    test('should return empty if undefined', () => {
      expect(Filters.upper('')).toEqual('');
    });

    test('should return the text to uppercase', () => {
      expect(Filters.upper('aaaa')).toEqual('AAAA');
    });
  });

  describe('displayFormat', () => {
    test('should display a smaller icon if the amount is less than 0.000001', () => {
      expect(Filters.displayFormat(new BigNumber(10 ** 3), 18)).toEqual(
        '<0.000001'
      );
    });

    test('should display the amount rounded at 5 decimal points', () => {
      expect(
        Filters.displayFormat(new BigNumber(1111110100000000), 18)
      ).toEqual('≈0.001111');
    });

    test('should return the number formatted as it is if not enough decimals', () => {
      expect(
        Filters.displayFormat(new BigNumber('11100000000000000000'), 18)
      ).toEqual('11.1');
    });

    test('display zero if deposit is zero', () => {
      expect(Filters.displayFormat(Zero, 18)).toEqual('0.0');
    });

    test('throw no exception if no decimals specified (18 assumed)', () => {
      expect(
        Filters.displayFormat(new BigNumber('11100000000000000001'))
      ).toEqual('≈11.100000');
    });
  });

  describe('capitalizeFirst', () => {
    test('should capitalize the first letter', () => {
      expect(Filters.capitalizeFirst('test')).toEqual('Test');
    });
  });

  describe('toUnits', () => {
    test('does not throw is undefined decimals but assumes 18 decimals', () => {
      expect(Filters.toUnits(new BigNumber('11100000000000000001'))).toEqual(
        '11.100000000000000001'
      );
    });
  });
});
