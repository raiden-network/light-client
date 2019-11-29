import AddressUtils from '@/utils/address-utils';

describe('AddressUtils', () => {
  test('returns false when the string is not an address', () => {
    expect(AddressUtils.isAddress('x')).toBe(false);
  });

  test('returns true when the string is a valid address', () => {
    expect(
      AddressUtils.isAddress('0x82641569b2062b545431cf6d7f0a418582865ba7')
    ).toBe(true);
  });

  test('returns false when the address is not in checksum format', () => {
    expect(
      AddressUtils.checkAddressChecksum(
        '0x82641569b2062b545431cf6d7f0a418582865ba7'
      )
    ).toBe(false);
  });

  test('returns true when the address is already in checksum format', () => {
    expect(
      AddressUtils.checkAddressChecksum(
        '0x82641569b2062B545431cF6D7F0A418582865ba7'
      )
    ).toBe(true);
  });

  test('returns false when the input is not an address', () => {
    expect(AddressUtils.checkAddressChecksum('5')).toBe(false);
  });
});
