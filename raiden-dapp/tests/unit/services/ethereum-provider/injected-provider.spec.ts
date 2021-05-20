import { MockedJsonRpcProvider, MockedJsonRpcProviderWithRequestHandler } from '../../utils/mocks';

import { InjectedProvider } from '@/services/ethereum-provider/injected-provider';

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

describe('InjectedProvider', () => {
  beforeEach(() => {
    window.ethereum = undefined;
    window.web3 = undefined;
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  test('is not available when no injected provider is available', () => {
    expect(InjectedProvider.isAvailable).toBe(false);
  });

  test('is available when ethereum provider is available', () => {
    window.ethereum = new MockedJsonRpcProviderWithRequestHandler();

    expect(InjectedProvider.isAvailable).toBe(true);
  });

  test('is available when web3 provider is available', () => {
    window.web3 = { currentProvider: new MockedJsonRpcProvider() };

    expect(InjectedProvider.isAvailable).toBe(true);
  });

  test('link throws error if no injected provider is available', () => {
    expect(InjectedProvider.link()).rejects.toThrow('No injected provider is available.');
  });

  test('can link with ethereum provider', async () => {
    window.ethereum = new MockedJsonRpcProviderWithRequestHandler();

    const provider = await InjectedProvider.link();

    expect(provider.account).toBe(0);
  });

  test('asks for permissions to access accounts on link with ethereum provider', async () => {
    window.ethereum = new MockedJsonRpcProviderWithRequestHandler();

    await InjectedProvider.link();

    expect(window.ethereum.request).toHaveBeenCalledTimes(1);
    expect(window.ethereum.request).toHaveBeenCalledWith({
      method: 'eth_requestAccounts',
    });
  });

  test('link throws error if user denies permissions to access accounts', () => {
    window.ethereum = new MockedJsonRpcProviderWithRequestHandler();
    window.ethereum.request.mockRejectedValue(new Error('User rejected the request.'));

    expect(InjectedProvider.link()).rejects.toThrow('User rejected the request.');
  });

  test('can link with injected web3 provider', async () => {
    window.web3 = { currentProvider: new MockedJsonRpcProvider() };

    const link = await InjectedProvider.link();

    expect(link.account).toBe(0);
  });

  test('link registers event handler to reset connection', async () => {
    window.ethereum = new MockedJsonRpcProviderWithRequestHandler();

    await InjectedProvider.link();

    expect(window.ethereum.on).toHaveBeenCalledTimes(2);
    // TOOD: check actual events that are listened. Hard to verify.
  });
});
