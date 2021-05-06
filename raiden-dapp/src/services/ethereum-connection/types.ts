import type { providers } from 'ethers';

// The type evaluation for static class members works slightly different for
// the moment. Thereby it is not possible to have any better type restrictions
// here. Though having the named type here in place will allows us to adopt it
// later and being explicit about it at all places.
export type EthereumConnectionOptions = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// TOOD: watch-out when `static abstract` becomes possible in TypeScript
export abstract class EthereumConnection {
  static connectionName: string;
  static isAvailable = false;
  static connect: (options: EthereumConnectionOptions) => Promise<EthereumConnection>;
  abstract provider: providers.JsonRpcProvider;
  abstract account: string | number;

  constructor() {
    const isAvailable = (this.constructor as typeof EthereumConnection).isAvailable;

    if (!isAvailable) {
      throw new Error('The connection is not available.');
    }
  }
}
