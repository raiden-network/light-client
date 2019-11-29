import { Web3Provider } from '@/services/web3-provider';

describe('web3Provider', () => {
  afterEach(() => {
    window.web3 = undefined;
    window.ethereum = undefined;
  });

  test('returns null when it detects no provider', async () => {
    const status = await Web3Provider.provider();
    expect(status).toBe(null);
  });

  test('throws an exception when the user denies access to the provider', async () => {
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

  test('returns the provider when the user allows the connection to the provider', async () => {
    window.ethereum = {
      enable: jest.fn().mockResolvedValue(true)
    };

    const status = await Web3Provider.provider();
    expect(status).toBe(window.ethereum);
  });

  test('returns a legacy web3 provider when it exists', async () => {
    window.web3 = {
      currentProvider: {}
    };

    const status = await Web3Provider.provider();
    expect(status).toBe(window.web3.currentProvider);
  });
});
