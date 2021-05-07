export class ConfigProvider {
  static contracts = jest.fn().mockResolvedValue(undefined);

  static configuration = jest.fn().mockResolvedValue({
    rpc_endpoint: 'https://some.rpc.endpoint',
    private_key: '0xprivateKey',
    per_network: {},
  });
}
