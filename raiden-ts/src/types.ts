/// <reference path="../typings/matrix-js-sdk/index.d.ts" />
import { Subject, BehaviorSubject, AsyncSubject } from 'rxjs';
import { Signer } from 'ethers';
import { JsonRpcProvider } from 'ethers/providers';
import { Network } from 'ethers/utils';
import { MatrixClient } from 'matrix-js-sdk';

import { TokenNetworkRegistry } from '../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../contracts/TokenNetwork';
import { HumanStandardToken } from '../contracts/HumanStandardToken';

import { RaidenAction } from './actions';
import { RaidenState } from './state';
import { Address } from './utils/types';

interface Info {
  address: Address;
  block_number: number;
}

export interface ContractsInfo {
  TokenNetworkRegistry: Info;
}

export interface RaidenEpicDeps {
  stateOutput$: BehaviorSubject<RaidenState>;
  actionOutput$: Subject<RaidenAction>;
  matrix$: AsyncSubject<MatrixClient>;
  provider: JsonRpcProvider;
  network: Network;
  signer: Signer;
  address: Address;
  contractsInfo: ContractsInfo;
  registryContract: TokenNetworkRegistry;
  getTokenNetworkContract: (address: Address) => TokenNetwork;
  getTokenContract: (address: Address) => HumanStandardToken;
}
