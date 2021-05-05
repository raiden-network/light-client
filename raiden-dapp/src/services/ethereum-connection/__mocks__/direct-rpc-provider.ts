export class DirectRpcProvider {
  public readonly account = 0;

  public static connect() {
    return new this();
  }

  get provider() {
    return {
      getNetwork: jest.fn().mockResolvedValue({ chainId: 5 }),
    };
  }
}
