import WalletConnectProvider from '@walletconnect/web3-provider';
import { providers } from 'ethers';

export class Web3Provider {
  static async provider(rpcEndpoint?: string) {
    let provider = null;

    if (rpcEndpoint) {
      if (!rpcEndpoint.startsWith('http')) {
        provider = `https://${rpcEndpoint}`;
      } else {
        provider = rpcEndpoint;
      }
    } else if (typeof window.ethereum !== 'undefined') {
      window.ethereum.autoRefreshOnNetworkChange = false;
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      provider = window.ethereum;
    } else if (window.web3) {
      provider = window.web3.currentProvider;
    } else {
      const provider = new WalletConnectProvider({
        infuraId: '1d7828db440547969591f9ef1f81a04d', // TODO: Replace with configuration value
      });
      await provider.enable();
      return new providers.Web3Provider(provider);
    }

    /* istanbul ignore next */
    if (provider && provider.isMetaMask) {
      // TODO: do the same for WalletConnect
      provider.on('chainChanged', () => window.location.replace(window.location.origin));
    }

    return provider;
  }

  static injectedWeb3Available = (): boolean => window.ethereum || window.web3;
}
