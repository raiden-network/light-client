export class InjectedProvider {
  public static readonly providerName = 'injected_provider_mock';
  public readonly account = 0;

  public static get isAvailable() {
    return true;
  }

  public static isDisabled = jest.fn().mockResolvedValue(false);
  public static link = jest.fn(async () => new InjectedProvider());
}
