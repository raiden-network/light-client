import { JsonRpcProvider } from 'ethers/providers';

export class Web3Provider {
  static async provider(config?: { INFURA_PROJECT_ID: string }) {
    const ethereum = window.ethereum;
    let provider = null;

    if (config) {
      provider = `https://goerli.infura.io/v3/${config.INFURA_PROJECT_ID}`;
    } else if (typeof ethereum !== 'undefined') {
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
