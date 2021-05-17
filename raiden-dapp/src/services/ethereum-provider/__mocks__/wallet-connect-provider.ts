export class WalletConnectProvider {
  public static readonly providerName = 'wallet_connect_mock';
  public readonly account = 0;

  public static link = jest.fn(async () => new WalletConnectProvider());
}
