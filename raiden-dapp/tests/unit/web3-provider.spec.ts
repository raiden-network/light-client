import { Web3Provider } from '@/services/web3-provider';

describe('web3Provider', () => {
  afterEach(() => {
    window.web3 = undefined;
    window.ethereum = undefined;
  });

  test('should return null when no provider is detected', async () => {
    const status = await Web3Provider.provider();
    expect(status).toBe(null);
  });

  test('should throw when the user denies access to the provider', async () => {
    window.ethereum = {
      enable: jest.fn().mockRejectedValue('denied')
    };

    try {
      await Web3Provider.provider();
      fail('This path should not execute');
    } catch (e) {
      expect(e).toBe('denied');
    }
  });

  test('should return the provider after the user allows connection to the provider', async () => {
    window.ethereum = {
      enable: jest.fn().mockResolvedValue(true)
    };

    const status = await Web3Provider.provider();
    expect(status).toBe(window.ethereum);
  });

  test('should check for legacy web3 providers', async () => {
    window.web3 = {
      currentProvider: {}
    };

    const status = await Web3Provider.provider();
    expect(status).toBe(window.web3.currentProvider);
  });
});
