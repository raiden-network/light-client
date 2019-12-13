import { AsyncSubject, Subject, Observable } from 'rxjs';
import { Signer } from 'ethers';
import { JsonRpcProvider } from 'ethers/providers';
import { Network } from 'ethers/utils';
import { MatrixClient } from 'matrix-js-sdk';

import { TokenNetworkRegistry } from './contracts/TokenNetworkRegistry';
import { ServiceRegistry } from './contracts/ServiceRegistry';
import { TokenNetwork } from './contracts/TokenNetwork';
import { HumanStandardToken } from './contracts/HumanStandardToken';
import { UserDeposit } from './contracts/UserDeposit';

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
}

export interface RaidenEpicDeps {
  latest$: Subject<{
    action: RaidenAction;
    state: RaidenState;
    config: RaidenConfig;
    presences: Presences;
    pfsList: readonly Address[];
  }>;
  config$: Observable<RaidenConfig>;
  matrix$: AsyncSubject<MatrixClient>;
  provider: JsonRpcProvider;
  network: Network;
  signer: Signer;
  address: Address;
  contractsInfo: ContractsInfo;
  registryContract: TokenNetworkRegistry;
  getTokenNetworkContract: (address: Address) => TokenNetwork;
  getTokenContract: (address: Address) => HumanStandardToken;
  serviceRegistryContract: ServiceRegistry;
  userDepositContract: UserDeposit;
  main?: { signer: Signer; address: Address };
}
