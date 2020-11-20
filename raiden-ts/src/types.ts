import type { AsyncSubject, Subject, Observable } from 'rxjs';
import type { Signer } from '@ethersproject/abstract-signer';
import type { Network } from '@ethersproject/networks';
import type { JsonRpcProvider } from '@ethersproject/providers';
import { MatrixClient } from 'matrix-js-sdk';
import { Logger } from 'loglevel';

import type {
  TokenNetworkRegistry,
  ServiceRegistry,
  TokenNetwork,
  HumanStandardToken,
  UserDeposit,
  SecretRegistry,
  MonitoringService,
} from './contracts';

import { RaidenAction } from './actions';
import { RaidenState } from './state';
import { Address, UInt } from './utils/types';
import { RaidenConfig } from './config';
import { Presences } from './transport/types';
import { RaidenDatabase } from './db/types';

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
