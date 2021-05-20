export class ConfigProvider {
  static contracts = jest.fn().mockResolvedValue(undefined);

  static configuration = jest.fn().mockResolvedValue({
    per_network: {},
  });
}
