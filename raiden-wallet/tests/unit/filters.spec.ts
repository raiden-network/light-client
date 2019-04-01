import Filters from '@/filters';

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
});
