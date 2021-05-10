import { DirectRpcProvider } from '@/services/ethereum-provider/direct-rpc-provider';

describe('DirectRpcProvider', () => {
  test('is always available', () => {
    expect(DirectRpcProvider.isAvailable).toBe(true);
  });

  test('it can link', async () => {
    const options = { rpcUrl: 'https://some.rpc.provider', privateKey: 'privateKey' };
    const provider = await DirectRpcProvider.link(options);

    expect(provider.provider.connection.url).toBe('https://some.rpc.provider');
    expect(provider.account).toBe('privateKey');
  });
});
