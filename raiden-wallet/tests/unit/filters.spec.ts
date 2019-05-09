import Filters from '@/filters';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';

describe('filters', function() {
  describe('truncate', function() {
    it('should return the same value if it is smaller than', function() {
      expect(Filters.truncate('123')).toEqual('123');
    });

    it('should return the value truncated', function() {
      expect(Filters.truncate('12345678', 4)).toEqual('12...78');
    });
  });
  describe('decimals', function() {
    it('should return a number formatted to 3 decimals', function() {
      expect(Filters.decimals('1.23444444')).toEqual('1.234');
    });
    it('should return a number formatted to 2 decimals', function() {
      expect(Filters.decimals('1.23456789', 2)).toEqual('1.23');
    });
  });

  describe('upper', function() {
    it('should return empty if undefined', function() {
      expect(Filters.upper('')).toEqual('');
    });

    it('should return the text to uppercase', function() {
      expect(Filters.upper('aaaa')).toEqual('AAAA');
    });
  });

  describe('displayFormat', function() {
    it('should display a smaller icon if the amount is less than 0.00001', function() {
      expect(Filters.displayFormat(new BigNumber(10 ** 3), 18)).toEqual(
        '<0.00001'
      );
    });

    it('should display the amount cutoff at 5 decimal points', function() {
      expect(
        Filters.displayFormat(new BigNumber(1111110100000000), 18)
      ).toEqual('0.00111');
    });

    it('should return the number formatted as it is if not enough decimals', function() {
      expect(
        Filters.displayFormat(new BigNumber('11100000000000000000'), 18)
      ).toEqual('11.1');
    });

    test('display zero if deposit is zero', () => {
      expect(Filters.displayFormat(Zero, 18)).toEqual('0.0');
    });
  });

  describe('capitalizeFirst', function() {
    it('should capitalize the first letter', function() {
      expect(Filters.capitalizeFirst('test')).toEqual('Test');
    });
  });
});
