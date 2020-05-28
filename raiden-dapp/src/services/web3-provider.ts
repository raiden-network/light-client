export class Web3Provider {
  static async provider(config?: { INFURA_ENDPOINT: string }) {
    const ethereum = window.ethereum;
    let provider = null;

    if (config) {
      if (!config.INFURA_ENDPOINT.startsWith('http')) {
        provider = `https://${config.INFURA_ENDPOINT}`;
      } else {
        provider = config.INFURA_ENDPOINT;
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
