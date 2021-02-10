import type { Signer } from '@ethersproject/abstract-signer';
import type { Network } from '@ethersproject/networks';
import type { JsonRpcProvider } from '@ethersproject/providers';
import type { Logger } from 'loglevel';
import type { MatrixClient } from 'matrix-js-sdk';
import type { AsyncSubject, Observable, Subject } from 'rxjs';

import type { RaidenAction } from './actions';
import type { RaidenConfig } from './config';
import type {
  HumanStandardToken,
  MonitoringService,
  SecretRegistry,
  ServiceRegistry,
  TokenNetwork,
  TokenNetworkRegistry,
  UserDeposit,
} from './contracts';
import type { RaidenDatabase } from './db/types';
import type { RaidenState } from './state';
import type { Presences } from './transport/types';
import type { Address, UInt } from './utils/types';

interface Info {
  address: Address;
  block_number: number;
}

export interface ContractsInfo {
  TokenNetworkRegistry: Info;
  ServiceRegistry: Info;
  UserDeposit: Info;
  SecretRegistry: Info;
  MonitoringService: Info;
  OneToN: Info;
}

export interface Latest {
  action: RaidenAction;
  state: RaidenState;
  config: RaidenConfig;
  presences: Presences;
  pfsList: readonly Address[];
  rtc: { [address: string]: RTCDataChannel };
  udcBalance: UInt<32>;
  blockTime: number;
  stale: boolean;
}

export interface RaidenEpicDeps {
  latest$: Subject<Latest>;
  config$: Observable<RaidenConfig>;
  matrix$: AsyncSubject<MatrixClient>;
  provider: JsonRpcProvider;
  network: Network;
  signer: Signer;
  address: Address;
  log: Logger;
  defaultConfig: RaidenConfig;
  contractsInfo: ContractsInfo;
  registryContract: TokenNetworkRegistry;
  getTokenNetworkContract: (address: Address) => TokenNetwork;
  getTokenContract: (address: Address) => HumanStandardToken;
  serviceRegistryContract: ServiceRegistry;
  userDepositContract: UserDeposit;
  secretRegistryContract: SecretRegistry;
  monitoringServiceContract: MonitoringService;
  main?: { signer: Signer; address: Address };
  db: RaidenDatabase;
  init$: Subject<Observable<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ChangeEvent<T extends string, P> {
  readonly type: T;
  readonly payload: P;
}

export type OnChange<T extends string, P> = (event: ChangeEvent<T, P>) => void;

export enum EventTypes {
  OPENED = 'OPENED',
  APPROVED = 'APPROVED',
  DEPOSITED = 'DEPOSITED',
  CONFIRMED = 'CONFIRMED',
}
