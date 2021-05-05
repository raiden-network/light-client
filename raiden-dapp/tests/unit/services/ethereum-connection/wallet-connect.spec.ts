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
  test('is always available', () => {
    expect(WalletConnect.isAvailable).toBe(true);
  });

  test('fail to connect when none of the options is provided', () => {
    expect(WalletConnect.connect({})).rejects.toThrow(
      'One of the options RPC URL or Infura Id are required to connect.',
    );
  });

  test('can connect with a RPC URL', async () => {
    await WalletConnect.connect({ rpcUrl: 'https://some.rpc.url' });
  });

  test('can connect with an Infura ID', async () => {
    await WalletConnect.connect({ infuraId: '6d333faba41b4c3d8ae979417e281832' });
  });

  test('fail to connect when multiple options are provided', () => {
    expect(
      WalletConnect.connect({
        rpcUrl: 'https://some.rpc.url',
        infuraId: '6d333faba41b4c3d8ae979417e281832',
      }),
    ).rejects.toThrow('One of the options RPC URL or Infura Id are required to connect.');
  });

  // TODO: we need more tests to get details like that the chain ID got
  // retrieved and more. Unfortunately do we currently lack in knowledge of how
  // to do so with Jest. First experiments failed due to EthersJS module
  // structure.
});
