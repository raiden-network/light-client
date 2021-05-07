export class DirectRpcProvider {
  public readonly account = 0;
  private chainId: number;

  private constructor(chainId = 5) {
    this.chainId = chainId;
  }

  public static async link(options?: { chainId?: number }) {
    return new this(options?.chainId);
  }

  get provider() {
    return {
      getNetwork: jest.fn().mockResolvedValue({ chainId: this.chainId }),
    };
  }
}
