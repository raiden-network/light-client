import type { providers } from 'ethers';

// The type evaluation for static class members works slightly different for
// the moment. Thereby it is not possible to have any better type restrictions
// here. Though having the named type here in place will allows us to adopt it
// later and being explicit about it at all places.
export type EthereumProviderOptions = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// TOOD: watch-out when `static abstract` becomes possible in TypeScript
export abstract class EthereumProvider {
  static providerName: string;
  static isAvailable = false;
  static link: (options: EthereumProviderOptions) => Promise<EthereumProvider>;
  abstract provider: providers.JsonRpcProvider;
  abstract account: string | number;

  constructor() {
    const isAvailable = (this.constructor as typeof EthereumProvider).isAvailable;

    if (!isAvailable) {
      throw new Error('The provider is not available.');
    }
  }
}
