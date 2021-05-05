import { DirectRpcProvider } from '@/services/ethereum-connection/direct-rpc-provider';

describe('DirectRpcProvider', () => {
  test('is always available', () => {
    expect(DirectRpcProvider.isAvailable).toBe(true);
  });

  test('it can connect', async () => {
    const options = { rpcUrl: 'https://some.rpc.provider', privateKey: 'privateKey' };
    const connection = await DirectRpcProvider.connect(options);

    expect(connection.provider.connection.url).toBe('https://some.rpc.provider');
    expect(connection.account).toBe('privateKey');
  });
});
