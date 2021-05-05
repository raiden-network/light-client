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

  public static async connect(options: {
    rpcUrl?: string;
    infuraId?: string;
  }): Promise<WalletConnect> {
    let walletConnectProvider: WalletConnectProvider;

    if (options.rpcUrl === undefined && options.infuraId === undefined) {
      throw new Error('One of the options RPC URL or Infura Id are required to connect.');
    } else if (options.rpcUrl !== undefined && options.infuraId !== undefined) {
      throw new Error('Only one connetion option allowed. Either a RPC URL or a Infura Id.');
    } else if (options.rpcUrl !== undefined) {
      walletConnectProvider = await getWalletConnectProviderWithRpcUrl(options.rpcUrl);
    } else if (options.infuraId) {
      walletConnectProvider = getWalletConnectProviderWithInfuraId(options.infuraId);
    }

    // The provider instance must be available here, though TypeScript can't see it.
    await walletConnectProvider!.enable();
    walletConnectProvider!.on('chainChanged', resetHandler);
    walletConnectProvider!.on('disconnect', resetHandler);

    return new this(walletConnectProvider!);
  }
}

async function getWalletConnectProviderWithRpcUrl(rpcUrl: string): Promise<WalletConnectProvider> {
  const temporaryJsonRpcProvider = new providers.JsonRpcProvider(rpcUrl);
  const networkOfProvider = await temporaryJsonRpcProvider.getNetwork();
  const options = {
    rpc: {
      [networkOfProvider.chainId]: rpcUrl,
    },
  };
  return new WalletConnectProvider(options);
}

function getWalletConnectProviderWithInfuraId(infuraId: string): WalletConnectProvider {
  return new WalletConnectProvider({ infuraId });
}

function resetHandler() {
  window.location.replace(window.location.origin);
}
