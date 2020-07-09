export class Web3Provider {
  static async provider(rpcEndpoint?: string) {
    const ethereum = window.ethereum;
    let provider = null;

    if (rpcEndpoint) {
      if (!rpcEndpoint.startsWith('http')) {
        provider = `https://${rpcEndpoint}`;
      } else {
        provider = rpcEndpoint;
      }
    } else if (typeof ethereum !== 'undefined') {
      await ethereum.enable();
      provider = ethereum;
    } else if (window.web3) {
      provider = window.web3.currentProvider;
    }

    /* istanbul ignore next */
    if (provider && provider.isMetaMask) {
      provider.autoRefreshOnNetworkChange = false;
      provider.on('networkChanged', () =>
        window.location.replace(window.location.origin)
      );
    }

    return provider;
  }

  static injectedWeb3Available = (): boolean => window.ethereum || window.web3;
}
