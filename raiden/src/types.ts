import { Subject } from 'rxjs';
import { Signer } from 'ethers';
import { JsonRpcProvider } from 'ethers/providers'
import { Network } from 'ethers/utils';

import { TokenNetworkRegistry } from '../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../contracts/TokenNetwork';
import { Token } from '../contracts/Token';
import { RaidenState, RaidenActions } from './store';

interface Info {
  address: string;
  block_number: number;
}

export interface ContractsInfo {
  TokenNetworkRegistry: Info;
  SecretRegistry: Info;
}

export interface RaidenContracts {
  registry: TokenNetworkRegistry;
  tokenNetworks: { [address: string]: TokenNetwork };
  tokens: { [address: string]: Token };
}

export interface RaidenEpicDeps {
  stateOutput$: Subject<RaidenState>;
  actionOutput$: Subject<RaidenActions>;
  provider: JsonRpcProvider;
  network: Network;
  signer: Signer;
  address: string;
  contractsInfo: ContractsInfo;
  registryContract: TokenNetworkRegistry;
  getTokenNetworkContract: (address: string) => TokenNetwork;
  getTokenContract: (address: string) => Token;
}
