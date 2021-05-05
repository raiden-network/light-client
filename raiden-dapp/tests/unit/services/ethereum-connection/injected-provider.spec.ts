import { MockedJsonRpcProvider, MockedJsonRpcProviderWithRequestHandler } from '../../utils/mocks';

import { InjectedProvider } from '@/services/ethereum-connection/injected-provider';

jest.mock('ethers', () => {
  const originalEthers = jest.requireActual('ethers');

  return {
    ...originalEthers,
    providers: {
      ...originalEthers.providers,
      Web3Provider: jest.fn(),
    },
  };
});

const originalWindow = window;

describe('InjectedProvider', () => {
  beforeEach(() => {
    window = originalWindow;
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  test('connect throws error if no injected provider is available', () => {
    expect(window.ethereum).toBeUndefined();
    expect(window.web3).toBeUndefined();

    expect(InjectedProvider.connect()).rejects.toThrow('No injected provider is available.');
  });

  test('can connect with ethereum provider', async () => {
    window.ethereum = new MockedJsonRpcProviderWithRequestHandler();

    const connection = await InjectedProvider.connect();

    expect(connection.account).toBe(0);
  });

  test('asks for permissions to access accounts on connect with ethereum provider', async () => {
    window.ethereum = new MockedJsonRpcProviderWithRequestHandler();

    await InjectedProvider.connect();

    expect(window.ethereum.request).toHaveBeenCalledTimes(1);
    expect(window.ethereum.request).toHaveBeenCalledWith({
      method: 'eth_requestAccounts',
    });
  });

  test('connect throws error if user denies permissions to access accounts', () => {
    window.ethereum = new MockedJsonRpcProviderWithRequestHandler();
    window.ethereum.request.mockRejectedValue(new Error('User rejected the request.'));

    expect(InjectedProvider.connect()).rejects.toThrow('User rejected the request.');
  });

  test('can connect with injected web3 provider', async () => {
    window.web3 = { currentProvider: new MockedJsonRpcProvider() };

    const connection = await InjectedProvider.connect();

    expect(connection.account).toBe(0);
  });

  test('connect registers event handler to reset connection', async () => {
    window.ethereum = new MockedJsonRpcProviderWithRequestHandler();

    await InjectedProvider.connect();

    expect(window.ethereum.on).toHaveBeenCalledTimes(2);
    // TOOD: check actual events that are listened. Hard to verify.
  });
});
