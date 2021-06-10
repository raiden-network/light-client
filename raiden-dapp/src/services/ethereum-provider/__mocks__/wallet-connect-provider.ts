export class WalletConnectProvider {
  public static readonly providerName = 'wallet_connect_mock';
  public readonly account = 0;

  public static isAvailable = true;
  public static isDisabled = jest.fn().mockResolvedValue(false);
  public static link = jest.fn(async () => new WalletConnectProvider());
}
