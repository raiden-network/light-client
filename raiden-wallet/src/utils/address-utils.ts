import { utils } from 'ethers';

export default class AddressUtils {
  static isAddress(address: string) {
    return /^(0x)?[0-9a-f]{40}$/i.test(address);
  }

  static checkAddressChecksum(address: string) {
    return address === utils.getAddress(address);
  }
}
