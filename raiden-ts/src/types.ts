import type { Signer } from '@ethersproject/abstract-signer';
import type { Network } from '@ethersproject/networks';
import type { JsonRpcProvider } from '@ethersproject/providers';
import * as t from 'io-ts';
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
import type { PFSFeeUpdate } from './messages/types';
import type { RaidenState } from './state';
import type { FeeModel } from './transfers/mediate/types';
import type { UInt } from './utils/types';
import { Address } from './utils/types';

const ContractNames = t.keyof({
  TokenNetworkRegistry: null,
  ServiceRegistry: null,
  UserDeposit: null,
  SecretRegistry: null,
  MonitoringService: null,
  OneToN: null,
});
const ContractInfo = t.readonly(t.type({ address: Address, block_number: t.number }));
export const ContractsInfo = t.readonly(t.record(ContractNames, ContractInfo));
export type ContractsInfo = t.TypeOf<typeof ContractsInfo>;

export interface Latest {
  action: RaidenAction;
  state: RaidenState;
  config: RaidenConfig;
  whitelisted: readonly Address[];
  rtc: { [address: string]: RTCDataChannel };
  udcDeposit: { balance: UInt<32>; totalDeposit: UInt<32> };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mediationFeeCalculator: FeeModel<any, PFSFeeUpdate['fee_schedule']>;
  getBlockTimestamp: (block: number) => Observable<number>;
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
