declare module 'ganache-cli' {
  import { Http2Server } from 'http2';
  import { AsyncSendable } from 'ethers/providers';

  export interface GanacheServerOptions {
    accounts?: { balance: string; secretKey?: string }[];
    debug?: boolean;
    blockTime?: number;
    logger?: Console;
    mnemonic?: string;
    port?: number;
    seed?: string;
    default_balance_ether?: number;
    total_accounts?: number;
    fork?: string;
    fork_block_number?: string | number;
    network_id?: number;
    time?: Date;
    locked?: boolean;
    unlocked_accounts?: string[];
    db_path?: string;
    db?: any; // eslint-disable-line
    ws?: boolean;
    account_keys_path?: string;
    vmErrorsOnRPCResponse?: boolean;
    hdPath?: string;
    hardfork?: string;
    allowUnlimitedContractSize?: boolean;
    gasPrice?: string;
    gasLimit?: string;
    keepAliveTimeout?: number;
  }

  export interface Ganache {
    provider(options?: GanacheServerOptions): AsyncSendable;
    server(options?: GanacheServerOptions): Http2Server;
  }

  const ganache: Ganache;
  export default ganache;
}

type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P]
};
