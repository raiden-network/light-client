import { AsyncSubject, Subject, Observable } from 'rxjs';
import { Signer } from 'ethers/abstract-signer';
import { JsonRpcProvider } from 'ethers/providers';
import { Network } from 'ethers/utils';
import { MatrixClient } from 'matrix-js-sdk';
import { Logger } from 'loglevel';

import { TokenNetworkRegistry } from './contracts/TokenNetworkRegistry';
import { ServiceRegistry } from './contracts/ServiceRegistry';
import { TokenNetwork } from './contracts/TokenNetwork';
import { HumanStandardToken } from './contracts/HumanStandardToken';
import { UserDeposit } from './contracts/UserDeposit';
import { SecretRegistry } from './contracts/SecretRegistry';

import { RaidenAction } from './actions';
import { RaidenState } from './state';
import { Address } from './utils/types';
import { RaidenConfig } from './config';
import { Presences } from './transport/types';

interface Info {
  address: Address;
  block_number: number;
}

export interface ContractsInfo {
  TokenNetworkRegistry: Info;
  ServiceRegistry: Info;
  UserDeposit: Info;
  SecretRegistry: Info;
}

export interface Latest {
  action: RaidenAction;
  state: RaidenState;
  config: RaidenConfig;
  presences: Presences;
  pfsList: readonly Address[];
  rtc: { [address: string]: RTCDataChannel };
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
  main?: { signer: Signer; address: Address };
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
