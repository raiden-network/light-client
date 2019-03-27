import { BehaviorSubject, Subject } from 'rxjs';

jest.mock('ethers/providers');
import { Signer, Wallet } from 'ethers';
import { JsonRpcProvider, EventType, Listener } from 'ethers/providers';
import { Network, Interface, ParamType } from 'ethers/utils';
jest.mock('ethers/contract');
import { Contract } from 'ethers/contract';

import { TokenNetworkRegistry } from '../../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../../contracts/TokenNetwork';
import { Token } from '../../contracts/Token';

import TokenNetworkRegistryAbi from 'raiden/abi/TokenNetworkRegistry.json';
import TokenNetworkAbi from 'raiden/abi/TokenNetwork.json';
import TokenAbi from 'raiden/abi/Token.json';

import { RaidenEpicDeps } from 'raiden/types';
import { RaidenState, initialState } from 'raiden/store/state';
import { RaidenActions } from 'raiden/store/actions';

interface MockRaidenEpicDeps extends RaidenEpicDeps {
  provider: jest.Mocked<JsonRpcProvider>;
  registryContract: jest.Mocked<TokenNetworkRegistry>;
  getTokenNetworkContract: (address: string) => jest.Mocked<TokenNetwork>;
  getTokenContract: (address: string) => jest.Mocked<Token>;
}

export function raidenEpicDeps(): MockRaidenEpicDeps {
  const network: Network = { name: 'testnet', chainId: 1337 };

  const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
  const listeners = new Map<EventType, Set<Listener>>();
  Object.assign(provider, {
    network,
    getNetwork: jest.fn(async () => network),
    on: jest.fn((event: EventType, callback: Listener) => {
      let cbs = listeners.get(event);
      if (!cbs) listeners.set(event, (cbs = new Set()));
      cbs.add(callback);
      return provider;
    }),
    removeListener: jest.fn((event: EventType, callback: Listener) => {
      const cbs = listeners.get(event);
      if (cbs) cbs.delete(callback);
      return provider;
    }),
    // eslint-disable-next-line
    emit: jest.fn((event: EventType, ...args: any[]) => {
      const cbs = listeners.get(event);
      if (cbs) cbs.forEach(cb => cb(...args));
      return !!cbs;
    }),
  });

  const signer: Signer = new Wallet(
    '0x0123456789012345678901234567890123456789012345678901234567890123',
    provider,
  );

  const registryAddress = '0xregistry';
  const registryContract = new Contract(
    registryAddress,
    TokenNetworkRegistryAbi,
    signer,
  ) as jest.Mocked<TokenNetworkRegistry>;
  Object.assign(registryContract, {
    address: registryAddress,
    provider,
    signer,
    interface: new Interface(TokenNetworkRegistryAbi as ParamType[]),
    functions: {
      ...registryContract.functions,
      // eslint-disable-next-line
      token_to_token_networks: jest.fn(async (token: string) => token + 'Network')
    },
  });

  const tokenNetworkContracts: { [address: string]: jest.Mocked<TokenNetwork> } = {};
  const getTokenNetworkContract = (address: string): jest.Mocked<TokenNetwork> => {
    if (!(address in tokenNetworkContracts)) {
      const tokenNetworkContract = new Contract(address, TokenNetworkAbi, signer) as jest.Mocked<
        TokenNetwork
      >;
      Object.assign(tokenNetworkContract, {
        address,
        provider,
        signer,
        interface: new Interface(TokenNetworkAbi as ParamType[]),
      });
      tokenNetworkContracts[address] = tokenNetworkContract;
    }
    return tokenNetworkContracts[address];
  };

  const tokenContracts: { [address: string]: jest.Mocked<Token> } = {};
  const getTokenContract = (address: string): jest.Mocked<Token> => {
    if (!(address in tokenContracts)) {
      const tokenContract = new Contract(address, TokenAbi, signer) as jest.Mocked<Token>;
      Object.assign(tokenContract, {
        address,
        provider,
        signer,
        interface: new Interface(TokenAbi as ParamType[]),
      });
      tokenContracts[address] = tokenContract;
    }
    return tokenContracts[address];
  };

  return {
    stateOutput$: new BehaviorSubject<RaidenState>(initialState),
    actionOutput$: new Subject<RaidenActions>(),
    address: '0xmyaddress',
    network,
    contractsInfo: {
      TokenNetworkRegistry: {
        address: registryContract.address,
        block_number: 120, // eslint-disable-line
      },
    },
    provider,
    signer,
    registryContract,
    getTokenNetworkContract,
    getTokenContract,
  };
}
