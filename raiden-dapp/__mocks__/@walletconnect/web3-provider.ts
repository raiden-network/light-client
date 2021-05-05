export default class WalletConnectProvider {
  enable = jest.fn().mockResolvedValue(true);
  on = jest.fn();
}
