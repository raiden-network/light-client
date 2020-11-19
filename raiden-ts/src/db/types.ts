import { BehaviorSubject } from 'rxjs';
import type { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import type logging from 'loglevel';

import type { TransferState } from '../transfers/state';
import { Address } from '../utils/types';

// type helper to recursively map values assignable to BigNumber as BigNumberish;
// to ensure a [de]serialized BigNumber from db (`{_hex:"0x"}`) isn't used as BigNumber directly
// and should be decoded first (unless somewhere accepting BigNumberish, e.g. BigNumber methods)
type AsBigNumberish<T> = T extends BigNumber
  ? BigNumberish
  : T extends boolean | string | number | null | symbol
  ? T
  : { [K in keyof T]: AsBigNumberish<T[K]> };

export interface TransferStateish extends AsBigNumberish<TransferState> {
  _rev: string;
}

export type Migrations = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly [version: number]: (doc: any, db: RaidenDatabase) => Promise<any[]>;
};

export interface RaidenDatabaseMeta {
  _id: '_meta';
  version: number;
  network: number;
  registry: Address;
  address: Address;
  blockNumber: number;
}

export type RaidenDatabaseOptions = {
  log?: logging.Logger;
  versionchanged?: boolean;
} & (
  | PouchDB.Configuration.LocalDatabaseConfiguration
  | PouchDB.Configuration.RemoteDatabaseConfiguration
);

export interface RaidenDatabase extends PouchDB.Database {
  storageKeys: Set<string>;
  busy$: BehaviorSubject<boolean>;
  constructor: RaidenDatabaseConstructor;
  __opts: RaidenDatabaseOptions;
}

export type RaidenDatabaseConstructor = (new (
  name?: string,
  options?:
    | PouchDB.Configuration.LocalDatabaseConfiguration
    | PouchDB.Configuration.RemoteDatabaseConfiguration,
) => RaidenDatabase) & { __defaults: RaidenDatabaseOptions };
