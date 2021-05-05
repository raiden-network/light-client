import WalletConnectProvider from '@walletconnect/web3-provider';
import { providers } from 'ethers';

import { EthereumConnection } from './types';

export class WalletConnect extends EthereumConnection {
  public static readonly connection_name = 'wallet_connect';
  public readonly provider: providers.JsonRpcProvider;
  public readonly account = 0; // Refers to the currently selected account in the wallet.

  private constructor(walletConnectProvider: providers.ExternalProvider) {
    super();
    this.provider = new providers.Web3Provider(walletConnectProvider);
  }

  public static async connect(options: { rpcUrl: string }): Promise<WalletConnect> {
    const temporaryJsonRpcProvider = new providers.JsonRpcProvider(options.rpcUrl);
    const networkOfProvider = await temporaryJsonRpcProvider.getNetwork();
    const walletConnectProvider = new WalletConnectProvider({
      rpc: {
        [networkOfProvider.chainId]: options.rpcUrl,
      },
    });

    await walletConnectProvider.enable();
    walletConnectProvider.on('chainChanged', resetHandler);
    walletConnectProvider.on('disconnect', resetHandler);

    return new this(walletConnectProvider);
  }
}

function resetHandler() {
  window.location.replace(window.location.origin);
}
