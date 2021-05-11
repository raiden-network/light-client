import WalletConnect from '@walletconnect/web3-provider';
import { providers } from 'ethers';

import { EthereumProvider } from './types';

export class WalletConnectProvider extends EthereumProvider {
  public static readonly providerName = 'wallet_connect';
  public static readonly isAvailable = true;
  public readonly provider: providers.JsonRpcProvider;
  public readonly account = 0; // Refers to the currently selected account in the wallet.

  private constructor(web3Provider: providers.ExternalProvider) {
    super();
    this.provider = new providers.Web3Provider(web3Provider);
  }

  public static async link(options: {
    rpcUrl?: string;
    infuraId?: string;
    bridgeUrl?: string;
  }): Promise<WalletConnectProvider> {
    const bridgeUrl = options?.bridgeUrl || undefined;
    let walletConnect: WalletConnect;

    if (options.rpcUrl === undefined && options.infuraId === undefined) {
      throw new Error('One of the options RPC URL or Infura Id are required to link.');
    } else if (options.rpcUrl !== undefined && options.infuraId !== undefined) {
      throw new Error('Only one link option allowed. Either a RPC URL or a Infura Id.');
    } else if (options.rpcUrl !== undefined) {
      walletConnect = await getWalletConnectWithRpcUrl(options.rpcUrl, bridgeUrl);
    } else if (options.infuraId) {
      walletConnect = getWalletConnectWithInfuraId(options.infuraId, bridgeUrl);
    }

    // The provider instance must be available here, though TypeScript can't see it.
    await walletConnect!.enable();
    walletConnect!.on('chainChanged', resetHandler);
    walletConnect!.on('disconnect', resetHandler);

    return new WalletConnectProvider(walletConnect!);
  }
}

async function getWalletConnectWithRpcUrl(
  rpcUrl: string,
  bridgeUrl?: string,
): Promise<WalletConnect> {
  const temporaryJsonRpcProvider = new providers.JsonRpcProvider(rpcUrl);
  const networkOfProvider = await temporaryJsonRpcProvider.getNetwork();
  const options = {
    bride: bridgeUrl,
    rpc: {
      [networkOfProvider.chainId]: rpcUrl,
    },
  };
  return new WalletConnect(options);
}

function getWalletConnectWithInfuraId(infuraId: string, bridgeUrl?: string): WalletConnect {
  return new WalletConnect({ bridge: bridgeUrl, infuraId });
}

function resetHandler() {
  window.location.replace(window.location.origin);
}
