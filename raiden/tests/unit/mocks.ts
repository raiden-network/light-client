import { BehaviorSubject, Subject } from 'rxjs';

// ethers's contracts use a lot defineReadOnly which doesn't allow us to mock
// functions and properties. Mock it here so we can mock later
jest.mock('ethers/utils/properties', () => ({
  ...jest.requireActual('ethers/utils/properties'),
  defineReadOnly: jest.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (object: any, name: string, value: any): void =>
      Object.defineProperty(object, name, {
        enumerable: true,
        value,
        writable: true,
        configurable: true,
      }),
  ),
}));

jest.mock('ethers/providers');
import { JsonRpcProvider, EventType, Listener } from 'ethers/providers';
import { Log } from 'ethers/providers/abstract-provider';
import { Network } from 'ethers/utils';
import { Contract, EventFilter } from 'ethers/contract';
import { Wallet } from 'ethers/wallet';

import { TokenNetworkRegistry } from '../../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../../contracts/TokenNetwork';
import { Token } from '../../contracts/Token';

import TokenNetworkRegistryAbi from 'raiden/abi/TokenNetworkRegistry.json';
import TokenNetworkAbi from 'raiden/abi/TokenNetwork.json';
import TokenAbi from 'raiden/abi/Token.json';

import { RaidenEpicDeps } from 'raiden/types';
import { RaidenState, initialState } from 'raiden/store/state';
import { RaidenActions } from 'raiden/store/actions';

type MockedContract<T extends Contract> = jest.Mocked<T> & {
  functions: {
    [K in keyof T['functions']]: jest.MockInstance<
      ReturnType<T['functions'][K]>,
      Parameters<T['functions'][K]>
    >
  };
};

interface MockRaidenEpicDeps extends RaidenEpicDeps {
  provider: jest.Mocked<JsonRpcProvider>;
  registryContract: MockedContract<TokenNetworkRegistry>;
  getTokenNetworkContract: (address: string) => MockedContract<TokenNetwork>;
  getTokenContract: (address: string) => MockedContract<Token>;
}

export function raidenEpicDeps(): MockRaidenEpicDeps {
  const network: Network = { name: 'testnet', chainId: 1337 };

  const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;

  /**
   * spyOn .on, .removeListener & .emit methods and replace with a synchronous simplified logic
   */
  const mockEthersEventEmitter = (target: JsonRpcProvider | Contract): void => {
    const listeners = new Map<EventType, Set<Listener>>();
    function getEventTag(event: EventType): string {
      if (typeof event === 'string') return event;
      else if (Array.isArray(event)) return `filter::${event.join('|')}`;
      else return `filter:${event.address}:${(event.topics || []).join('|')}`;
    }
    jest.spyOn(target, 'on').mockImplementation((event: EventType, callback: Listener) => {
      event = getEventTag(event);
      let cbs = listeners.get(event);
      if (!cbs) listeners.set(event, (cbs = new Set()));
      cbs.add(callback);
      return target;
    });
    jest
      .spyOn(target, 'removeListener')
      .mockImplementation((event: EventType, callback: Listener) => {
        event = getEventTag(event);
        const cbs = listeners.get(event);
        if (cbs) cbs.delete(callback);
        return target;
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(target, 'emit').mockImplementation((event: EventType, ...args: any[]) => {
      event = getEventTag(event);
      const cbs = listeners.get(event);
      if (cbs) cbs.forEach(cb => cb(...args));
      return !!cbs;
    });
  };

  Object.assign(provider, { network });
  jest.spyOn(provider, 'getNetwork').mockImplementation(async () => network);
  jest.spyOn(provider, 'resolveName').mockImplementation(async addressOrName => addressOrName);
  jest.spyOn(provider, 'getLogs').mockResolvedValue([]);
  jest.spyOn(provider, 'listAccounts').mockResolvedValue([]);
  mockEthersEventEmitter(provider);

  const signer = new Wallet(
    '0x0123456789012345678901234567890123456789012345678901234567890123',
    provider,
  );
  const address = signer.address;

  const registryAddress = '0xregistry';
  const registryContract = new Contract(
    registryAddress,
    TokenNetworkRegistryAbi,
    signer,
  ) as MockedContract<TokenNetworkRegistry>;
  for (const func in registryContract.functions) {
    jest.spyOn(registryContract.functions, func as keyof TokenNetworkRegistry['functions']);
  }
  registryContract.functions.token_to_token_networks.mockImplementation(
    async (token: string) => token + 'Network',
  );

  const tokenNetworkContracts: { [address: string]: MockedContract<TokenNetwork> } = {};
  const getTokenNetworkContract = (address: string): MockedContract<TokenNetwork> => {
    if (!(address in tokenNetworkContracts)) {
      const tokenNetworkContract = new Contract(
        address,
        TokenNetworkAbi,
        signer,
      ) as MockedContract<TokenNetwork>;
      for (const func in tokenNetworkContract.functions) {
        jest.spyOn(tokenNetworkContract.functions, func as keyof TokenNetwork['functions']);
      }
      tokenNetworkContracts[address] = tokenNetworkContract;
    }
    return tokenNetworkContracts[address];
  };

  const tokenContracts: { [address: string]: MockedContract<Token> } = {};
  const getTokenContract = (address: string): MockedContract<Token> => {
    if (!(address in tokenContracts)) {
      const tokenContract = new Contract(address, TokenAbi, signer) as MockedContract<Token>;
      for (const func in tokenContract.functions) {
        jest.spyOn(tokenContract.functions, func as keyof Token['functions']);
      }
      tokenContracts[address] = tokenContract;
    }
    return tokenContracts[address];
  };

  return {
    stateOutput$: new BehaviorSubject<RaidenState>(initialState),
    actionOutput$: new Subject<RaidenActions>(),
    address,
    network,
    contractsInfo: {
      TokenNetworkRegistry: {
        address: registryContract.address,
        block_number: 100, // eslint-disable-line
      },
    },
    provider,
    signer,
    registryContract,
    getTokenNetworkContract,
    getTokenContract,
  };
}

export function makeLog({ filter, ...opts }: { filter: EventFilter } & Partial<Log>): Log {
  const blockNumber = opts.blockNumber || 1337;
  return {
    blockNumber: blockNumber,
    blockHash: `0xblockHash${blockNumber}`,
    transactionIndex: 1,
    removed: false,
    transactionLogIndex: 1,
    data: '0x',
    transactionHash: `0xtxHash${blockNumber}`,
    logIndex: 1,
    ...opts,
    address: filter.address!,
    topics: filter.topics!,
  };
}
