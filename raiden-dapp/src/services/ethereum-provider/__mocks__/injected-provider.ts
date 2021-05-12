export class InjectedProvider {
  public static readonly providerName = 'injected_provider_mock';
  public readonly account = 0;

  public static link = jest.fn().mockResolvedValue(undefined);
}
