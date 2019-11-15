/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase */

import { patchEthersDefineReadOnly, patchMatrixGetNetwork } from './patches';
patchEthersDefineReadOnly();
patchMatrixGetNetwork();

import { BehaviorSubject, Subject, AsyncSubject, of } from 'rxjs';
import { MatrixClient } from 'matrix-js-sdk';
import { EventEmitter } from 'events';
import { memoize } from 'lodash';

jest.mock('ethers/providers');
import { JsonRpcProvider, EventType, Listener } from 'ethers/providers';
import { Log } from 'ethers/providers/abstract-provider';
import { Network } from 'ethers/utils';
import { Contract, EventFilter } from 'ethers/contract';
import { Wallet } from 'ethers/wallet';

import { TokenNetworkRegistry } from 'raiden-ts/contracts/TokenNetworkRegistry';
import { TokenNetwork } from 'raiden-ts/contracts/TokenNetwork';
import { HumanStandardToken } from 'raiden-ts/contracts/HumanStandardToken';
import { ServiceRegistry } from 'raiden-ts/contracts/ServiceRegistry';

import { TokenNetworkRegistryFactory } from 'raiden-ts/contracts/TokenNetworkRegistryFactory';
import { TokenNetworkFactory } from 'raiden-ts/contracts/TokenNetworkFactory';
import { HumanStandardTokenFactory } from 'raiden-ts/contracts/HumanStandardTokenFactory';
import { ServiceRegistryFactory } from 'raiden-ts/contracts/ServiceRegistryFactory';
import { UserDepositFactory } from 'raiden-ts/contracts/UserDepositFactory';

import 'raiden-ts/polyfills';
import { RaidenEpicDeps, ContractsInfo } from 'raiden-ts/types';
import { RaidenAction } from 'raiden-ts/actions';
import { RaidenState, makeInitialState } from 'raiden-ts/state';
import { Address, Signature } from 'raiden-ts/utils/types';
import { getServerName } from 'raiden-ts/utils/matrix';
import { RaidenConfig } from 'raiden-ts/config';
import { pluck, distinctUntilChanged } from 'rxjs/operators';
import { UserDeposit } from 'raiden-ts/contracts/UserDeposit';

export type MockedContract<T extends Contract> = jest.Mocked<T> & {
  functions: {
    [K in keyof T['functions']]: jest.MockInstance<
      ReturnType<T['functions'][K]>,
      Parameters<T['functions'][K]>
    >;
  };
};

export interface MockRaidenEpicDeps extends RaidenEpicDeps {
  provider: jest.Mocked<JsonRpcProvider>;
  registryContract: MockedContract<TokenNetworkRegistry>;
  getTokenNetworkContract: (address: string) => MockedContract<TokenNetwork>;
  getTokenContract: (address: string) => MockedContract<HumanStandardToken>;
  serviceRegistryContract: MockedContract<ServiceRegistry>;
  userDepositContract: MockedContract<UserDeposit>;
}

/**
 * Create a mock of RaidenEpicDeps
 *
 * @returns Mocked RaidenEpicDeps
 */
export function raidenEpicDeps(): MockRaidenEpicDeps {
  const network: Network = { name: 'testnet', chainId: 1337 };

  const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;

  // spyOn .on, .removeListener & .emit methods and replace with a synchronous simplified logic
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
    jest.spyOn(target, 'listenerCount').mockImplementation((event?: EventType): number => {
      if (event && listeners.has(event)) return listeners.get(getEventTag(event))!.size;
      else if (event) return 0;
      let count = 0;
      for (const cbs of listeners.values()) count += cbs.size;
      return count;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn(target, 'emit').mockImplementation((event: EventType, ...args: any[]) => {
      event = getEventTag(event);
      if (event === '*') {
        for (const cbs of listeners.values()) for (const cb of cbs) cb(...args);
      } else if (listeners.has(event)) listeners.get(event)!.forEach(cb => cb(...args));
      return true;
    });
  };

  let blockNumber = 125;
  Object.assign(provider, { network });
  Object.defineProperty(provider, 'blockNumber', { get: () => blockNumber });
  jest.spyOn(provider, 'getNetwork').mockImplementation(async () => network);
  jest.spyOn(provider, 'resolveName').mockImplementation(async addressOrName => addressOrName);
  jest.spyOn(provider, 'getLogs').mockResolvedValue([]);
  jest.spyOn(provider, 'listAccounts').mockResolvedValue([]);
  // See: https://github.com/cartant/rxjs-marbles/issues/11
  jest
    .spyOn(provider, 'getBlockNumber')
    .mockImplementation(async () => (of(blockNumber) as unknown) as Promise<number>);
  // use provider.resetEventsBlock used to set current block number for provider
  jest
    .spyOn(provider, 'resetEventsBlock')
    .mockImplementation((number: number) => (blockNumber = number));
  mockEthersEventEmitter(provider);

  const signer = new Wallet(
    '0x0123456789012345678901234567890123456789012345678901234567890123',
    provider,
  );
  const address = signer.address as Address;

  const registryAddress = '0xregistry';
  const registryContract = TokenNetworkRegistryFactory.connect(
    registryAddress,
    signer,
  ) as MockedContract<TokenNetworkRegistry>;
  for (const func in registryContract.functions) {
    jest.spyOn(registryContract.functions, func as keyof TokenNetworkRegistry['functions']);
  }
  registryContract.functions.token_to_token_networks.mockImplementation(
    async (token: string) => token + 'Network',
  );

  const getTokenNetworkContract = memoize(
    (address: string): MockedContract<TokenNetwork> => {
      const tokenNetworkContract = TokenNetworkFactory.connect(address, signer) as MockedContract<
        TokenNetwork
      >;
      for (const func in tokenNetworkContract.functions) {
        jest.spyOn(tokenNetworkContract.functions, func as keyof TokenNetwork['functions']);
      }
      return tokenNetworkContract;
    },
  );

  const getTokenContract = memoize(
    (address: string): MockedContract<HumanStandardToken> => {
      const tokenContract = HumanStandardTokenFactory.connect(address, signer) as MockedContract<
        HumanStandardToken
      >;
      for (const func in tokenContract.functions) {
        jest.spyOn(tokenContract.functions, func as keyof HumanStandardToken['functions']);
      }
      return tokenContract;
    },
  );

  const serviceRegistryContract = ServiceRegistryFactory.connect(
    registryAddress,
    signer,
  ) as MockedContract<ServiceRegistry>;
  for (const func in serviceRegistryContract.functions) {
    jest.spyOn(serviceRegistryContract.functions, func as keyof ServiceRegistry['functions']);
  }
  serviceRegistryContract.functions.token.mockResolvedValue(
    '0x0800000000000000000000000000000000000008',
  );
  serviceRegistryContract.functions.urls.mockImplementation(async () => 'https://pfs.raiden.test');

  const userDepositContract = UserDepositFactory.connect(address, signer) as MockedContract<
    UserDeposit
  >;

  for (const func in userDepositContract.functions) {
    jest.spyOn(userDepositContract.functions, func as keyof UserDeposit['functions']);
  }

  userDepositContract.functions.one_to_n_address.mockResolvedValue(
    '0x0A0000000000000000000000000000000000000a',
  );

  const contractsInfo: ContractsInfo = {
      TokenNetworkRegistry: {
        address: registryContract.address as Address,
        block_number: 100,
      },
      ServiceRegistry: {
        address: serviceRegistryContract.address as Address,
        block_number: 101,
      },
      UserDeposit: {
        address: userDepositContract.address as Address,
        block_number: 102,
      },
    },
    initialState = makeInitialState(
      { network, address, contractsInfo },
      { blockNumber, config: { pfsSafetyMargin: 1.1, pfs: 'https://pfs.raiden.test' } },
    );

  const stateOutput$ = new BehaviorSubject<RaidenState>(initialState),
    config$ = new BehaviorSubject<RaidenConfig>(initialState.config);

  stateOutput$
    .pipe(
      pluck('config'),
      distinctUntilChanged(),
    )
    .subscribe(config$);

  return {
    stateOutput$,
    actionOutput$: new Subject<RaidenAction>(),
    config$,
    matrix$: new AsyncSubject<MatrixClient>(),
    address,
    network,
    contractsInfo,
    provider,
    signer,
    registryContract,
    getTokenNetworkContract,
    getTokenContract,
    serviceRegistryContract,
    userDepositContract,
  };
}

/**
 * Create a mocked ethers Log object
 *
 * @param filter - EventFilter object
 * @returns Log object
 */
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

/**
 * Returns a mocked MatrixClient
 *
 * @param userId - userId of account owner
 * @param server - server mock hostname
 * @returns Mocked MatrixClient
 */
export function makeMatrix(userId: string, server: string): jest.Mocked<MatrixClient> {
  return (Object.assign(new EventEmitter(), {
    startClient: jest.fn(async () => true),
    stopClient: jest.fn(() => true),
    setDisplayName: jest.fn(async () => true),
    joinRoom: jest.fn(async () => true),
    loginWithPassword: jest.fn().mockRejectedValue(new Error('invalid password')),
    register: jest.fn(async userName => {
      userId = `@${userName}:${server}`;
      return {
        user_id: userId,
        device_id: `${userName}_device_id`,
        access_token: `${userName}_access_token`,
      };
    }),
    searchUserDirectory: jest.fn(async ({ term }) => ({
      results: [{ user_id: `@${term}:${server}`, display_name: `${term}_display_name` }],
    })),
    getUserId: jest.fn(() => userId),
    getUsers: jest.fn(() => []),
    getUser: jest.fn(userId => ({ userId, presence: 'offline' })),
    getProfileInfo: jest.fn(async userId => ({ displayname: `${userId}_display_name` })),
    createRoom: jest.fn(async ({ visibility, invite }) => ({
      room_id: `!roomId_${visibility || 'public'}_with_${(invite || []).join('_')}:${server}`,
      getMember: jest.fn(),
      getCanonicalAlias: jest.fn(() => null),
      getAliases: jest.fn(() => []),
    })),
    getRoom: jest.fn(roomId => ({
      roomId,
      getMember: jest.fn(),
      getCanonicalAlias: jest.fn(() => null),
      getAliases: jest.fn(() => []),
    })),
    getRooms: jest.fn(() => []),
    getHomeserverUrl: jest.fn(() => getServerName(server)),
    invite: jest.fn(async () => true),
    leave: jest.fn(async () => true),
    sendEvent: jest.fn(async () => true),
    _http: {
      opts: {},
      // mock request done by raiden/utils::getUserPresence
      authedRequest: jest.fn(async () => ({
        user_id: 'user_id',
        last_active_ago: 1,
        presence: 'online',
      })),
    },
  }) as unknown) as jest.Mocked<MatrixClient>;
}

/**
 * Returns some valid signature
 *
 * @returns Some arbitrary valid signature hex string
 */
export function makeSignature(): Signature {
  return '0x5770d597b270ad9d1225c901b1ef6bfd8782b15d7541379619c5dae02c5c03c1196291b042a4fea9dbddcb1c6bcd2a5ee19180e8dc881c2e9298757e84ad190b1c' as Signature;
}
