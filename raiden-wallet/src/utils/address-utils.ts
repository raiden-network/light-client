import { utils } from 'ethers';

export default class AddressUtils {
  static isAddress(address: string) {
    return /^(0x)?[0-9a-f]{40}$/i.test(address);
  }

  static checkAddressChecksum(address: string) {
    try {
      return address === utils.getAddress(address);
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
