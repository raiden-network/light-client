import Filters from '@/filters';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';

describe('filters', function() {
  describe('truncate', function() {
    test('should return the same value if it is smaller than', function() {
      expect(Filters.truncate('123')).toEqual('123');
    });

    test('should return the value truncated', function() {
      expect(Filters.truncate('12345678', 4)).toEqual('12...78');
    });
  });
  describe('decimals', function() {
    test('should return a number formatted to 3 decimals', function() {
      expect(Filters.decimals('1.23444444')).toEqual('1.234');
    });
    test('should return a number formatted to 2 decimals', function() {
      expect(Filters.decimals('1.23456789', 2)).toEqual('1.23');
    });
  });

  describe('upper', function() {
    test('should return empty if undefined', function() {
      expect(Filters.upper('')).toEqual('');
    });

    test('should return the text to uppercase', function() {
      expect(Filters.upper('aaaa')).toEqual('AAAA');
    });
  });

  describe('displayFormat', function() {
    test('should display a smaller icon if the amount is less than 0.000001', function() {
      expect(Filters.displayFormat(new BigNumber(10 ** 3), 18)).toEqual(
        '<0.000001'
      );
    });

    test('should display the amount rounded at 5 decimal points', function() {
      expect(
        Filters.displayFormat(new BigNumber(1111110100000000), 18)
      ).toEqual('≈0.001111');
    });

    test('should return the number formatted as it is if not enough decimals', function() {
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

  describe('capitalizeFirst', function() {
    test('should capitalize the first letter', function() {
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
