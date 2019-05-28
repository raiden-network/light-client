/// <reference path="../typings/matrix-js-sdk/index.d.ts" />
import { Subject, BehaviorSubject, AsyncSubject } from 'rxjs';
import { Signer } from 'ethers';
import { JsonRpcProvider } from 'ethers/providers';
import { Network, BigNumber } from 'ethers/utils';
import { MatrixClient } from 'matrix-js-sdk';

import { TokenNetworkRegistry } from '../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../contracts/TokenNetwork';
import { Token } from '../contracts/Token';
import { RaidenState, RaidenActions, Channel } from './store';
export { ChannelState } from './store';

interface Info {
  address: string;
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
  actionOutput$: Subject<RaidenActions>;
  matrix$: AsyncSubject<MatrixClient>;
  provider: JsonRpcProvider;
  network: Network;
  signer: Signer;
  address: string;
  contractsInfo: ContractsInfo;
  registryContract: TokenNetworkRegistry;
  getTokenNetworkContract: (address: string) => TokenNetwork;
  getTokenContract: (address: string) => Token;
}

export interface RaidenChannel extends Channel {
  token: string;
  tokenNetwork: string;
  partner: string;
}

export interface RaidenChannels {
  [token: string]: {
    [partner: string]: RaidenChannel;
  };
}

// subset of dom' Storage/localStorage interface which supports async/await
export interface Storage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface TokenInfo {
  totalSupply: BigNumber;
  decimals: number;
  name?: string;
  symbol?: string;
}
