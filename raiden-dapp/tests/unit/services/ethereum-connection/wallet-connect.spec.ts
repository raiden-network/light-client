import { WalletConnect } from '@/services/ethereum-connection/wallet-connect';

jest.mock('@walletconnect/web3-provider');
jest.mock('ethers', () => {
  const originalEthers = jest.requireActual('ethers');

  class MockedJsonRpcProvider {
    getNetwork = jest.fn().mockResolvedValue({ chainId: 5 });
  }

  return {
    ...originalEthers,
    providers: {
      ...originalEthers.providers,
      JsonRpcProvider: MockedJsonRpcProvider,
      Web3Provider: jest.fn(),
    },
  };
});

describe('WalletConnect', () => {
  test('it can connect', async () => {
    await WalletConnect.connect({ rpcUrl: 'https://some.rpc.url' });
  });

  // TODO: we need more tests to get details like that the chain ID got
  // retrieved and more. Unfortunately do we currently lack in knowledge of how
  // to do so with Jest. First experiments failed due to EthersJS module
  // structure.
});
