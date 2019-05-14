export class Web3Provider {
  static async provider() {
    const ethereum = window.ethereum;
    let provider = null;
    if (typeof ethereum !== 'undefined') {
      await ethereum.enable();
      provider = ethereum;
    } else if (window.web3) {
      provider = window.web3.currentProvider;
    }

    if (provider && provider.isMetaMask) {
      provider.autoRefreshOnNetworkChange = false;
    }

    return provider;
  }

  static injectedWeb3Available = (): boolean => window.ethereum || window.web3;
}
