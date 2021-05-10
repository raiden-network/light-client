import { WalletConnectProvider } from '@/services/ethereum-provider/wallet-connect-provider';

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

describe('WalletConnectProvider', () => {
  test('is always available', () => {
    expect(WalletConnectProvider.isAvailable).toBe(true);
  });

  test('fail to link when none of the options is provided', () => {
    expect(WalletConnectProvider.link({})).rejects.toThrow(
      'One of the options RPC URL or Infura Id are required to link.',
    );
  });

  test('can link with a RPC URL', async () => {
    await WalletConnectProvider.link({ rpcUrl: 'https://some.rpc.url' });
  });

  test('can link with an Infura ID', async () => {
    await WalletConnectProvider.link({ infuraId: '6d333faba41b4c3d8ae979417e281832' });
  });

  test('fail to link when multiple options are provided', () => {
    expect(
      WalletConnectProvider.link({
        rpcUrl: 'https://some.rpc.url',
        infuraId: '6d333faba41b4c3d8ae979417e281832',
      }),
    ).rejects.toThrow('Only one link option allowed. Either a RPC URL or a Infura Id.');
  });

  // TODO: we need more tests to get details like that the chain ID got
  // retrieved and more. Unfortunately do we currently lack in knowledge of how
  // to do so with Jest. First experiments failed due to EthersJS module
  // structure.
});
