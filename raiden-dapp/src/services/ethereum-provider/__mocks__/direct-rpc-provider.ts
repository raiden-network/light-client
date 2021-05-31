export class DirectRpcProvider {
  public static readonly providerName = 'direct_rpc_provider_mock';
  public readonly account = 0;
  private chainId: number;

  private constructor(chainId = 5) {
    this.chainId = chainId;
  }

  public static isDisabled = jest.fn().mockResolvedValue(false);

  public static link = jest.fn(async (options?: { chainId?: number }) => {
    return new DirectRpcProvider(options?.chainId);
  });

  get provider() {
    return {
      getNetwork: jest.fn().mockResolvedValue({ chainId: this.chainId }),
    };
  }
}
