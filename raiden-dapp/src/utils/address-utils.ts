import { getAddress } from 'ethers/utils';

export default class AddressUtils {
  static isAddress(address: string): boolean {
    return /^(0x)?[0-9a-f]{40}$/i.test(address);
  }

  static checkAddressChecksum(address: string): boolean {
    try {
      return address === getAddress(address);
    } catch (e) {
      return false;
    }
  }

  static isAddressLike(address: string): boolean {
    return address.startsWith('0x');
  }

  static isDomain(address: string): boolean {
    return /\b((?=[a-z0-9-]{1,63}\.)(xn--)?[a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,63}\b/.test(
      address
    );
  }
}
