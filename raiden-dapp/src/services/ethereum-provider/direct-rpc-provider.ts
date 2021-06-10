import { providers } from 'ethers';

import { EthereumProvider } from './types';

export class DirectRpcProvider extends EthereumProvider {
  public static readonly providerName = 'direct_rpc_provider';
  public static readonly isAvailable = true;
  public readonly provider: providers.JsonRpcProvider;
  public readonly account: string;

  private constructor(rpcUrl: string, privateKey: string) {
    super();
    this.provider = new providers.JsonRpcProvider(rpcUrl);
    this.account = privateKey;
  }

  public static async link(options: {
    rpcUrl: string;
    privateKey: string;
  }): Promise<DirectRpcProvider> {
    return new this(options.rpcUrl, options.privateKey);
  }
}
