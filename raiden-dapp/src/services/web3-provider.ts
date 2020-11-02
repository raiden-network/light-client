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
    }

    /* istanbul ignore next */
    if (provider && provider.isMetaMask) {
      provider.on('chainChanged', () => window.location.replace(window.location.origin));
    }

    return provider;
  }

  static injectedWeb3Available = (): boolean => window.ethereum || window.web3;
}
