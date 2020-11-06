/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'ganache-cli' {
  import 'jest-extended';
  import type { Http2Server } from 'http2';
  import type { ExternalProvider } from '@ethersproject/providers';

  export interface GanacheServerOptions {
    accounts?: { balance: string; secretKey?: string }[];
    debug?: boolean;
    blockTime?: number;
    logger?: { log: (...args: any[]) => void };
    mnemonic?: string;
    port?: number;
    seed?: string;
    default_balance_ether?: number;
    total_accounts?: number;
    fork?: string;
    fork_block_number?: string | number;
    network_id?: number;
    _chainIdRpc?: number;
    _chainId?: number;
    time?: Date;
    locked?: boolean;
    unlocked_accounts?: string[];
    db_path?: string;
    db?: any;
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
    provider(options?: GanacheServerOptions): ExternalProvider;
    server(options?: GanacheServerOptions): Http2Server;
  }

  const ganache: Ganache;
  export default ganache;
}

declare module 'pouchdb-debug';
