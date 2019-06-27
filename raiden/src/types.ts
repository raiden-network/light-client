/// <reference path="../typings/matrix-js-sdk/index.d.ts" />
import { Subject, BehaviorSubject, AsyncSubject } from 'rxjs';
import { Signer } from 'ethers';
import { JsonRpcProvider } from 'ethers/providers';
import { Network, BigNumber } from 'ethers/utils';
import { MatrixClient } from 'matrix-js-sdk';

import { TokenNetworkRegistry } from '../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../contracts/TokenNetwork';
import { Token } from '../contracts/Token';

import { RaidenAction } from './actions';
import { RaidenState } from './store';
import { ChannelState } from './channels';
import { Address } from './utils/types';

interface Info {
  address: Address;
  block_number: number;
}

export interface ContractsInfo {
  TokenNetworkRegistry: Info;
}

export interface RaidenContracts {
  registry: TokenNetworkRegistry;
  tokenNetworks: { [address: string]: TokenNetwork };
  tokens: { [address: string]: Token };
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
  getTokenContract: (address: Address) => Token;
}

export interface RaidenChannel {
  token: Address;
  tokenNetwork: Address;
  partner: Address;
  state: ChannelState;
  ownDeposit: BigNumber;
  partnerDeposit: BigNumber;
  balance: BigNumber;
  id?: number;
  settleTimeout?: number;
  openBlock?: number;
  closeBlock?: number;
}

export interface RaidenChannels {
  [token: string]: {
    [partner: string]: RaidenChannel;
  };
}

export interface TokenInfo {
  totalSupply: BigNumber;
  decimals: number;
  name?: string;
  symbol?: string;
}
