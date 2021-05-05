import type { providers } from 'ethers';

export abstract class EthereumConnection {
  static connection_name: string;
  static connect: (options?: any) => Promise<EthereumConnection>; // eslint-disable-line @typescript-eslint/no-explicit-any
  abstract provider: providers.JsonRpcProvider;
  abstract account: string | number;
}
