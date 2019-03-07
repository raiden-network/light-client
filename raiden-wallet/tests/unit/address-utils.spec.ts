import AddressUtils from '@/utils/address-utils';

describe('AddressUtils', function() {
  it('should return false if string is not an address', function() {
    expect(AddressUtils.isAddress('x')).toBe(false);
  });

  it('should return true if the string is a valid address', function() {
    expect(
      AddressUtils.isAddress('0x82641569b2062b545431cf6d7f0a418582865ba7')
    ).toBe(true);
  });

  it('should return false when the address is not in checksum format', function() {
    expect(
      AddressUtils.checkAddressChecksum(
        '0x82641569b2062b545431cf6d7f0a418582865ba7'
      )
    ).toBe(false);
  });

  it('should return true when the address is already in checksum format', function() {
    expect(
      AddressUtils.checkAddressChecksum(
        '0x82641569b2062B545431cF6D7F0A418582865ba7'
      )
    ).toBe(true);
  });

  it('should ', function() {
    try {
      AddressUtils.checkAddressChecksum('5');
      fail('Previous method call should have failed');
    } catch (e) {
      expect(e.message).toContain('invalid address');
    }
  });
});
