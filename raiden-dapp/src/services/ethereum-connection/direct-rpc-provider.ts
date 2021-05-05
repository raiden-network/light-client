import { providers } from 'ethers';

import { EthereumConnection } from './types';

export class DirectRpcProvider extends EthereumConnection {
  public static readonly connection_name = 'direct_rpc_provider';
  public static readonly isAvailable = true;
  public readonly provider: providers.JsonRpcProvider;
  public readonly account: string;

  private constructor(rpcUrl: string, privateKey: string) {
    super();
    this.provider = new providers.JsonRpcProvider(rpcUrl);
    this.account = privateKey;
  }

  public static async connect(options: {
    rpcUrl: string;
    privateKey: string;
  }): Promise<DirectRpcProvider> {
    return new this(options.rpcUrl, options.privateKey);
  }
}
