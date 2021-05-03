import WalletConnectProvider from '@walletconnect/web3-provider';
import { providers } from 'ethers';

import type { Configuration } from '@/services/config-provider';
import type { EthereumProvider } from '@/types';

function resetHandler() {
  window.location.replace(window.location.origin);
}

export class Web3Provider {
  static async provider(configuration?: Configuration): Promise<EthereumProvider | undefined> {
    if (configuration?.rpc_endpoint) {
      return getPureRpcProvider(configuration.rpc_endpoint);
    } else if (window.ethereum || window.web3) {
      return await getInjectedProvider();
    } else if (configuration?.rpc_endpoint_wallet_connect) {
      return getWalletConnectProvider(configuration.rpc_endpoint_wallet_connect);
    } else {
      return undefined;
    }
  }
}

function getPureRpcProvider(rpcEndpoint: string): EthereumProvider {
  return rpcEndpoint.startsWith('http') ? rpcEndpoint : `https://${rpcEndpoint}`;
}

async function getInjectedProvider(): Promise<EthereumProvider> {
  let provider;

  if (window.ethereum) {
    provider = window.ethereum;
    provider.autoRefreshOnNetworkChange = false;
    await provider.request({ method: 'eth_requestAccounts' });
  } else if (window.web3) {
    provider = window.web3.currentProvider;
  }

  registerResetHandler(provider);
  return provider;
}

async function getWalletConnectProvider(rpcEndpoint: string): Promise<EthereumProvider> {
  const chainId = await getChainIdOfRpcEndpoint(rpcEndpoint);
  const provider = new WalletConnectProvider({
    rpc: {
      [chainId]: rpcEndpoint,
    },
  });
  await provider.enable();
  registerResetHandler(provider); // The packed Web3 provider does not have correct event handling anymore.
  return new providers.Web3Provider(provider);
}

function registerResetHandler(provider: EthereumProvider | WalletConnectProvider): void {
  if (typeof provider !== 'string') {
    provider.on('chainChanged', resetHandler);
    provider.on('disconnect', resetHandler);
  }
}

async function getChainIdOfRpcEndpoint(rpcEndpoint: string): Promise<number> {
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
