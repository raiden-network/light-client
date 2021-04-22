import WalletConnectProvider from '@walletconnect/web3-provider';
import { providers } from 'ethers';

export class Web3Provider {
  static async provider(rpcEndpoint?: string, rpcEndpointWalletConnect?: string) {
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
    } else if (rpcEndpointWalletConnect) {
      const chainId = await getRpcEndpointChainId(rpcEndpointWalletConnect);
      const provider = new WalletConnectProvider({
        rpc: {
          [chainId]: rpcEndpointWalletConnect,
        },
      });
      await provider.enable();
      return new providers.Web3Provider(provider);
    }

    /* istanbul ignore next */
    if (provider && (provider.isMetaMask || provider.isWalletConnect)) {
      const resetHandler = () => window.location.replace(window.location.origin);
      provider.on('chainChanged', resetHandler);
      provider.on('disconnect', resetHandler);
    }

    return provider;
  }

  static injectedWeb3Available = (): boolean => window.ethereum || window.web3;
}

async function getRpcEndpointChainId(rpcEndpoint: string): Promise<number> {
  const requestBody = { method: 'eth_chainId', params: [], id: 1, jsonrpc: '2.0' };
  const response = await fetch(rpcEndpoint, {
    method: 'POST',
    body: JSON.stringify(requestBody),
    headers: { 'Content-Type': 'application/json' },
  });

  if (response.ok) {
    const responseBody = await response.json();
    return parseInt(responseBody.result, 16);
  } else {
    throw new Error(
      `Failed to get chain ID from '${rpcEndpoint}' with response: '${JSON.stringify(response)}'`,
    );
  }
}
