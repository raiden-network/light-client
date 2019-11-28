import AddressUtils from '@/utils/address-utils';

describe('AddressUtils', function() {
  test('should return false if string is not an address', function() {
    expect(AddressUtils.isAddress('x')).toBe(false);
  });

  test('should return true if the string is a valid address', function() {
    expect(
      AddressUtils.isAddress('0x82641569b2062b545431cf6d7f0a418582865ba7')
    ).toBe(true);
  });

  test('should return false when the address is not in checksum format', function() {
    expect(
      AddressUtils.checkAddressChecksum(
        '0x82641569b2062b545431cf6d7f0a418582865ba7'
      )
    ).toBe(false);
  });

  test('should return true when the address is already in checksum format', function() {
    expect(
      AddressUtils.checkAddressChecksum(
        '0x82641569b2062B545431cF6D7F0A418582865ba7'
      )
    ).toBe(true);
  });

  test('should return false if the input is not an address', function() {
    expect(AddressUtils.checkAddressChecksum('5')).toBe(false);
  });
});
