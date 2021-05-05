import type { providers } from 'ethers';

export abstract class EthereumConnection {
  static connection_name: string;
  static isAvailable = false;
  static connect: (options?: any) => Promise<EthereumConnection>; // eslint-disable-line @typescript-eslint/no-explicit-any
  abstract provider: providers.JsonRpcProvider;
  abstract account: string | number;

  constructor() {
    const isAvailable = (this.constructor as typeof EthereumConnection).isAvailable;

    if (!isAvailable) {
      throw new Error('The connection is not available.');
    }
  }
}
