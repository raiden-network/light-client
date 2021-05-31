/* eslint-disable @typescript-eslint/no-explicit-any */
import { providers } from 'ethers';

import { ConfigProvider } from '@/services/config-provider';
import { EthereumProvider } from '@/services/ethereum-provider';

jest.mock('@/services/config-provider');

class TestProvider extends EthereumProvider {
  static providerName = 'test_provider';
  account = 0;
  provider = new providers.JsonRpcProvider('https://test.provider');
}

describe('EthereumProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('providers are not available per default', () => {
    expect(TestProvider.isAvailable).toBeFalsy();
  });

  test('can not instantiate provider if marked as not available', () => {
    expect(() => new TestProvider()).toThrow('The provider is not available.');
  });

  test('provider is not disabled if configuration does not include list of disabled providers', () => {
    expect.assertions(1);

    (ConfigProvider.configuration as any).mockResolvedValueOnce({
      disabled_ethereum_providers: undefined,
    });

    expect(TestProvider.isDisabled()).resolves.toBeFalsy();
  });

  test('provider is not disabled if configuration does not include the providers name', () => {
    expect.assertions(1);

    (ConfigProvider.configuration as any).mockResolvedValueOnce({
      disabled_ethereum_providers: ['other_provider'],
    });

    expect(TestProvider.isDisabled()).resolves.toBeFalsy();
  });

  test('provider is disabled if configuration includes the providers name', () => {
    expect.assertions(1);

    (ConfigProvider.configuration as any).mockResolvedValueOnce({
      disabled_ethereum_providers: ['test_provider'],
    });

    expect(TestProvider.isDisabled()).resolves.toBeTruthy();
  });
});
