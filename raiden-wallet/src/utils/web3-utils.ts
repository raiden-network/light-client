import * as Utils from 'web3-utils';

export default class Web3Utils {
  static isAddress(address: string) {
    return Utils.isAddress(address);
  }

  static checkAddressChecksum(address: string) {
    return Utils.checkAddressChecksum(address);
  }
}
