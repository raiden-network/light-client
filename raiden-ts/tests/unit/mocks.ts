/* eslint-disable @typescript-eslint/no-explicit-any */
import { patchEthersDefineReadOnly, patchEthersGetNetwork, patchVerifyMessage } from './patches';
patchVerifyMessage();
patchEthersDefineReadOnly();
patchEthersGetNetwork();

import { AsyncSubject, of, BehaviorSubject, ReplaySubject } from 'rxjs';
import { MatrixClient } from 'matrix-js-sdk';
import { EventEmitter } from 'events';
import { memoize } from 'lodash';
import logging from 'loglevel';
import { Store, createStore, applyMiddleware } from 'redux';

// TODO: remove this mock
jest.mock('ethers/providers');
import { JsonRpcProvider, EventType, Listener } from 'ethers/providers';
import { Zero, HashZero } from 'ethers/constants';
import { Log, Filter } from 'ethers/providers/abstract-provider';
import {
  Network,
  parseEther,
  getAddress,
  hexlify,
  randomBytes,
  keccak256,
  verifyMessage,
  bigNumberify,
} from 'ethers/utils';
import { Contract, EventFilter, ContractTransaction } from 'ethers/contract';
import { Wallet } from 'ethers/wallet';

import { TokenNetworkRegistry } from 'raiden-ts/contracts/TokenNetworkRegistry';
import { TokenNetwork } from 'raiden-ts/contracts/TokenNetwork';
import { HumanStandardToken } from 'raiden-ts/contracts/HumanStandardToken';
import { ServiceRegistry } from 'raiden-ts/contracts/ServiceRegistry';
import { UserDeposit } from 'raiden-ts/contracts/UserDeposit';
import { SecretRegistry } from 'raiden-ts/contracts/SecretRegistry';

import { TokenNetworkRegistryFactory } from 'raiden-ts/contracts/TokenNetworkRegistryFactory';
import { TokenNetworkFactory } from 'raiden-ts/contracts/TokenNetworkFactory';
import { HumanStandardTokenFactory } from 'raiden-ts/contracts/HumanStandardTokenFactory';
import { ServiceRegistryFactory } from 'raiden-ts/contracts/ServiceRegistryFactory';
import { UserDepositFactory } from 'raiden-ts/contracts/UserDepositFactory';
import { SecretRegistryFactory } from 'raiden-ts/contracts/SecretRegistryFactory';
import { MonitoringServiceFactory } from 'raiden-ts/contracts/MonitoringServiceFactory';
import { MonitoringService } from 'raiden-ts/contracts/MonitoringService';

import { RaidenEpicDeps, ContractsInfo, Latest } from 'raiden-ts/types';
import { makeInitialState, RaidenState } from 'raiden-ts/state';
import { assert } from 'raiden-ts/utils';
import { Address, Signature, UInt, Hash } from 'raiden-ts/utils/types';
import { getServerName } from 'raiden-ts/utils/matrix';
import { pluckDistinct } from 'raiden-ts/utils/rx';
import { raidenConfigUpdate, RaidenAction, raidenShutdown } from 'raiden-ts/actions';
import { makeDefaultConfig, RaidenConfig } from 'raiden-ts/config';
import { makeSecret } from 'raiden-ts/transfers/utils';
import { raidenReducer } from 'raiden-ts/reducer';
import { ShutdownReason } from 'raiden-ts/constants';
import { createEpicMiddleware } from 'redux-observable';
import { raidenRootEpic } from 'raiden-ts/epics';
import { filter, take } from 'rxjs/operators';

logging.setLevel(logging.levels.DEBUG);

export type MockedTransaction = ContractTransaction & {
  wait: jest.MockedFunction<ContractTransaction['wait']>;
};

export type MockedContract<T extends Contract> = jest.Mocked<T> & {
  functions: {
    [K in keyof T['functions']]: jest.MockInstance<
      ReturnType<T['functions'][K]> extends Promise<ContractTransaction>
        ? Promise<MockedTransaction>
        : ReturnType<T['functions'][K]>,
      Parameters<T['functions'][K]>
    >;
  };
};

export interface MockRaidenEpicDeps extends RaidenEpicDeps {
  signer: Wallet;
  provider: jest.Mocked<JsonRpcProvider>;
  registryContract: MockedContract<TokenNetworkRegistry>;
  getTokenNetworkContract: (address: string) => MockedContract<TokenNetwork>;
  getTokenContract: (address: string) => MockedContract<HumanStandardToken>;
  serviceRegistryContract: MockedContract<ServiceRegistry>;
  userDepositContract: MockedContract<UserDeposit>;
  secretRegistryContract: MockedContract<SecretRegistry>;
}

/**
 * Returns some valid signature
 *
 * @returns Some arbitrary valid signature hex string
 */
export function makeSignature(): Signature {
  return '0x5770d597b270ad9d1225c901b1ef6bfd8782b15d7541379619c5dae02c5c03c1196291b042a4fea9dbddcb1c6bcd2a5ee19180e8dc881c2e9298757e84ad190b1c' as Signature;
}

// not all random 32bytes values are valid secp256k1 private keys, retry
function makeWallet() {
  let wallet: Wallet | undefined;
  do {
    try {
      wallet = new Wallet(makeSecret());
      assert(Address.is(wallet.address));
    } catch (err) {}
  } while (!wallet);
  return wallet;
}

/**
 * Generate a random address
 *
 * @returns address
 */
export function makeAddress() {
  return getAddress(hexlify(randomBytes(20))) as Address;
}

/**
 * Generate a random hash
 *
 * @returns hash
 */
export function makeHash() {
  return keccak256(randomBytes(32)) as Hash;
}

/**
 * Create a mocked ethers Log object
 *
 * @param filter - Options
 * @param filter.filter - EventFilter object
 * @returns Log object
 */
export function makeLog({ filter, ...opts }: { filter: EventFilter } & Partial<Log>): Log {
  return {
    blockNumber: opts.blockNumber || mockedClients[0]?.deps?.provider?.blockNumber || 1337,
    blockHash: makeHash(),
    transactionIndex: 1,
    removed: false,
    transactionLogIndex: 1,
    data: '0x',
    transactionHash: makeHash(),
    logIndex: 1,
    ...opts,
    address: filter.address!,
    topics: filter.topics!,
  };
}

/**
 * @param status - Status of the transaction (default=succeed)
 * @param overrides - Properties to override on returned transaction
 * @returns Mocked ContractTransaction
 */
export function makeTransaction(
  status = 1,
  overrides?: Partial<MockedTransaction>,
): MockedTransaction {
  const transactionHash = makeHash();
  return {
    hash: transactionHash,
    confirmations: 1,
    nonce: 0,
    gasLimit: bigNumberify(1e5),
    gasPrice: bigNumberify(1e9),
    value: Zero,
    data: '0x',
    chainId: 1337,
    from: makeAddress(),
    wait: jest
      .fn()
      .mockResolvedValue({ byzantium: true, status, transactionHash, blockNumber: 1 }),
    ...overrides,
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
    joinRoom: jest.fn(async () => true),
    // reject to test register
    login: jest.fn().mockRejectedValue(new Error('invalid password')),
    register: jest.fn(async (userName) => {
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
    getUser: jest.fn((userId) => ({ userId, presence: 'offline', setDisplayName: jest.fn() })),
    getProfileInfo: jest.fn(async (userId) => ({ displayname: `${userId}_display_name` })),
    setDisplayName: jest.fn(async () => null),
    setAvatarUrl: jest.fn(async () => null),
    setPresence: jest.fn(async () => null),
    createRoom: jest.fn(async ({ visibility, invite }) => ({
      room_id: `!roomId_${visibility || 'public'}_with_${(invite || []).join('_')}:${server}`,
      getMember: jest.fn(),
      getCanonicalAlias: jest.fn(() => null),
      getAliases: jest.fn(() => []),
    })),
    getRoom: jest.fn((roomId) => ({
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
    turnServer: jest.fn(async () => ({
      uris: 'https://turn.raiden.test',
      ttl: 86400,
      username: 'user',
      password: 'password',
    })),
  }) as unknown) as jest.Mocked<MatrixClient>;
}

/**
 * Spies and mocks classes constructors on globalThis
 *
 * @returns Mocked spies
 */
export function mockRTC() {
  const rtcDataChannel = (Object.assign(new EventEmitter(), {
    close: jest.fn(),
  }) as unknown) as jest.Mocked<RTCDataChannel & EventEmitter>;

  const rtcConnection = (Object.assign(new EventEmitter(), {
    createDataChannel: jest.fn(() => rtcDataChannel),
    createOffer: jest.fn(async () => ({})),
    createAnswer: jest.fn(async () => ({})),
    setLocalDescription: jest.fn(async () => {
      /* local */
    }),
    setRemoteDescription: jest.fn(async () => {
      /* remote */
    }),
    addIceCandidate: jest.fn(),
  }) as unknown) as jest.Mocked<RTCPeerConnection & EventEmitter>;

  const RTCPeerConnection = jest
    .spyOn(globalThis, 'RTCPeerConnection')
    .mockImplementation(() => rtcConnection);

  return { rtcDataChannel, rtcConnection, RTCPeerConnection };
}

// array of cleanup functions registered on current test
const mockedCleanups: (() => void)[] = [];

afterEach(() => {
  let clean;
  while ((clean = mockedCleanups.pop())) clean();
});

// spyOn .on, .removeListener & .emit methods and replace with a synchronous simplified logic
function mockEthersEventEmitter(target: JsonRpcProvider | Contract): void {
  let listeners: Map<EventType, Set<Listener>> | null = new Map();

  function getEventTag(event: EventType): string {
    if (typeof event === 'string') return event;
    else if (Array.isArray(event)) return `filter::${event.join('|')}`;
    else return `filter:${event.address}:${(event.topics ?? []).join('|')}`;
  }

  const onSpy = jest
    .spyOn(target, 'on')
    .mockImplementation((event: EventType, callback: Listener) => {
      if (!listeners) return target;
      event = getEventTag(event);
      let cbs = listeners.get(event);
      if (!cbs) listeners.set(event, (cbs = new Set()));
      cbs.add(callback);
      return target;
    });
  const removeSpy = jest
    .spyOn(target, 'removeListener')
    .mockImplementation((event: EventType, callback: Listener) => {
      if (!listeners) return target;
      event = getEventTag(event);
      const cbs = listeners.get(event);
      if (cbs) cbs.delete(callback);
      return target;
    });
  const countSpy = jest
    .spyOn(target, 'listenerCount')
    .mockImplementation((event?: EventType): number => {
      if (!listeners) return 0;
      if (event) return listeners.get(getEventTag(event))?.size ?? 0;
      return Array.from(listeners.values()).reduce((acc, cbs) => acc + cbs.size, 0);
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emitSpy = jest
    .spyOn(target, 'emit')
    .mockImplementation((event: EventType, ...args: any[]) => {
      if (!listeners) return false;
      event = getEventTag(event);
      if (event === '*') {
        for (const cbs of listeners.values()) for (const cb of cbs) cb(...args);
      } else if (listeners.has(event)) listeners.get(event)!.forEach((cb) => cb(...args));
      return true;
    });

  mockedCleanups.push(() => {
    listeners?.clear();
    listeners = null;
    onSpy.mockRestore();
    removeSpy.mockRestore();
    countSpy.mockRestore();
    emitSpy.mockRestore();
  });
}

/**
 * Create a mock of RaidenEpicDeps
 *
 * @returns Mocked RaidenEpicDeps
 */
export function raidenEpicDeps(): MockRaidenEpicDeps {
  const network: Network = { name: 'testnet', chainId: 1337 };

  const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;

  let blockNumber = 125;
  Object.assign(provider, { network, _ethersType: 'Provider' });
  Object.defineProperty(provider, 'blockNumber', { get: () => blockNumber });
  jest.spyOn(provider, 'getNetwork').mockImplementation(async () => network);
  jest.spyOn(provider, 'resolveName').mockImplementation(async (addressOrName) => addressOrName);
  jest.spyOn(provider, 'listAccounts').mockResolvedValue([]);
  // See: https://github.com/cartant/rxjs-marbles/issues/11
  jest
    .spyOn(provider, 'getBlockNumber')
    .mockImplementation(async () => (of(blockNumber) as unknown) as Promise<number>);
  // use provider.resetEventsBlock used to set current block number for provider
  jest.spyOn(provider, 'resetEventsBlock').mockImplementation((n: number) => (blockNumber = n));

  const logs: Log[] = [];
  const origEmit = provider.emit;
  jest.spyOn(provider, 'emit').mockImplementation((event: EventType, ...args: any[]) => {
    if (typeof event !== 'string' && !Array.isArray(event)) logs.push(args[0] as Log);
    return origEmit.call(provider, event, ...args);
  });
  jest.spyOn(provider, 'getLogs').mockImplementation(async (filter: Filter) => {
    return logs.filter((log) => {
      if (filter.address && filter.address !== log.address) return false;
      if (
        filter.topics &&
        !filter.topics.every(
          (f, i) =>
            f == null ||
            f === log.topics[i] ||
            (Array.isArray(f) && f.some((f1) => f1 === log.topics[i])),
        )
      )
        return false;
      if (filter.fromBlock && log.blockNumber! < filter.fromBlock) return false;
      if (typeof filter.toBlock === 'number' && log.blockNumber! > filter.toBlock!) return false;
      return true;
    });
  });
  mockEthersEventEmitter(provider);

  const signer = makeWallet().connect(provider);
  const address = signer.address as Address;
  const log = logging.getLogger(`raiden:${address}`);

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
      tokenNetworkContract.functions.getChannelParticipantInfo.mockResolvedValue([
        Zero,
        Zero,
        false,
        HashZero,
        Zero,
        HashZero,
        Zero,
      ]);
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
      tokenContract.functions.allowance.mockResolvedValue(Zero);
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
  userDepositContract.functions.balances.mockResolvedValue(parseEther('5'));
  userDepositContract.functions.total_deposit.mockResolvedValue(parseEther('5'));
  userDepositContract.functions.effectiveBalance.mockResolvedValue(parseEther('5'));
  userDepositContract.functions.withdraw_plans.mockResolvedValue({
    amount: Zero,
    withdraw_block: Zero,
    0: Zero,
    1: Zero,
  });

  const secretRegistryContract = SecretRegistryFactory.connect(address, signer) as MockedContract<
    SecretRegistry
  >;

  for (const func in secretRegistryContract.functions) {
    jest.spyOn(secretRegistryContract.functions, func as keyof SecretRegistry['functions']);
  }

  const monitoringServiceContract = MonitoringServiceFactory.connect(
    address,
    signer,
  ) as MockedContract<MonitoringService>;

  for (const func in monitoringServiceContract.functions) {
    jest.spyOn(monitoringServiceContract.functions, func as keyof MonitoringService['functions']);
  }

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
      SecretRegistry: {
        address: secretRegistryContract.address as Address,
        block_number: 102,
      },
      MonitoringService: {
        address: monitoringServiceContract.address as Address,
        block_number: 102,
      },
    },
    state = makeInitialState({ network, address, contractsInfo }, { blockNumber }),
    defaultConfig = makeDefaultConfig(
      { network },
      {
        matrixServerLookup: 'https://matrixLookup.raiden.test',
        pfsSafetyMargin: 1.1,
        pfs: 'pfs.raiden.test',
        httpTimeout: 300,
        confirmationBlocks: 2,
      },
    ),
    config = { ...defaultConfig, ...state.config };

  const latest$ = new BehaviorSubject<Latest>({
      action: raidenConfigUpdate({}),
      state,
      config,
      presences: {},
      pfsList: [],
      rtc: {},
      udcBalance: Zero as UInt<32>,
    }),
    config$ = latest$.pipe(pluckDistinct('config'));

  return {
    latest$,
    config$,
    matrix$: new AsyncSubject<MatrixClient>(),
    address,
    log,
    defaultConfig,
    network,
    contractsInfo,
    provider,
    signer,
    registryContract,
    getTokenNetworkContract,
    getTokenContract,
    serviceRegistryContract,
    userDepositContract,
    secretRegistryContract,
    monitoringServiceContract,
  };
}

const mockedMatrixUsers: {
  [userId: string]: {
    userId: string;
    presence: string;
    displayName?: string;
    avatarUrl?: string;
  };
} = {};

function mockedMatrixCreateClient({ baseUrl }: { baseUrl: string }): jest.Mocked<MatrixClient> {
  const server = getServerName(baseUrl)!;
  let userId: string;
  let address: string;
  return (Object.assign(new EventEmitter(), {
    startClient: jest.fn(async () => (mockedMatrixUsers[userId].presence = 'online')),
    stopClient: jest.fn(() => {
      delete mockedMatrixUsers[userId];
    }),
    joinRoom: jest.fn(async (alias) => ({
      roomId: `!${alias}_room_id:${server}`,
      currentState: { setStateEvents: jest.fn() },
      getCanonicalAlias: jest.fn(),
      getAliases: jest.fn(() => [alias]),
    })),
    // reject to test register
    login: jest.fn().mockRejectedValue(new Error('invalid password')),
    register: jest.fn(async (user, password) => {
      address = getAddress(user);
      assert(verifyMessage(server, password) === address, 'wrong password');
      userId = `@${user}:${server}`;
      mockedMatrixUsers[userId] = {
        userId,
        presence: 'offline',
      };
      return {
        user_id: userId,
        device_id: `${user}_device_id`,
        access_token: `${user}_access_token`,
      };
    }),
    searchUserDirectory: jest.fn(async ({ term }) => ({
      results: Object.values(mockedMatrixUsers)
        .filter((u) => u.userId.includes(term))
        .map((u) => ({ user_id: u.userId, display_name: u.displayName })),
    })),
    getUserId: jest.fn(() => userId),
    getUsers: jest.fn(() => Object.values(mockedMatrixUsers)),
    getUser: jest.fn((userId) => mockedMatrixUsers[userId] ?? null),
    getProfileInfo: jest.fn(async (userId) => {
      if (!(userId in mockedMatrixUsers)) return null;
      return {
        displayname: mockedMatrixUsers[userId].displayName,
        avatar_url: mockedMatrixUsers[userId].avatarUrl,
      };
    }),
    setDisplayName: jest.fn(async (displayname) => {
      assert(userId in mockedMatrixUsers);
      assert(verifyMessage(userId, displayname) === address);
      mockedMatrixUsers[userId].displayName = displayname;
    }),
    setAvatarUrl: jest.fn(async (avatarUrl) => {
      assert(userId in mockedMatrixUsers);
      mockedMatrixUsers[userId].avatarUrl = avatarUrl;
    }),
    setPresence: jest.fn(async ({ presence }: { presence: string }) => {
      assert(userId in mockedMatrixUsers);
      mockedMatrixUsers[userId].presence = presence;
    }),
    createRoom: jest.fn(async ({ visibility, invite }) => ({
      room_id: `!roomId_${visibility || 'public'}_with_${(invite || []).join('_')}:${server}`,
      getMember: jest.fn(),
      getCanonicalAlias: jest.fn(() => null),
      getAliases: jest.fn(() => []),
    })),
    getRoom: jest.fn((roomId) => ({
      roomId,
      getMember: jest.fn(),
      getCanonicalAlias: jest.fn(() => null),
      getAliases: jest.fn(() => []),
    })),
    getRooms: jest.fn(() => []),
    getHomeserverUrl: jest.fn(() => server),
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
    turnServer: jest.fn(async () => ({
      uris: 'https://turn.raiden.test',
      ttl: 86400,
      username: 'user',
      password: 'password',
    })),
    store: {
      storeRoom: jest.fn(),
    },
    createFilter: jest.fn(async () => true),
  }) as unknown) as jest.Mocked<MatrixClient>;
}

jest.mock('matrix-js-sdk', () => ({
  ...jest.requireActual<any>('matrix-js-sdk'),
  createClient: jest.fn(mockedMatrixCreateClient),
}));

export interface MockedRaiden {
  address: Address;
  store: Store<RaidenState, RaidenAction>;
  deps: MockRaidenEpicDeps;
  config: RaidenConfig;
  output: RaidenAction[];
  start: () => Promise<void>;
  started: boolean | undefined;
  stop: () => void;
}

const mockedClients: MockedRaiden[] = [];
const registryAddress = makeAddress();
const serviceRegistryAddress = makeAddress();
const svtAddress = makeAddress();
const oneToNAddress = makeAddress();
const udcAddress = makeAddress();

/**
 * Create a mock of a Raiden client for epics
 *
 * @param wallet - Use this wallet instead of generating a random one
 * @param start - Automatically starts the client if set too true (default)
 * @returns Mocked Raiden Epics params
 */
export async function makeRaiden(wallet?: Wallet, start = true): Promise<MockedRaiden> {
  const network: Network = { name: 'testnet', chainId: 1337 };
  const { JsonRpcProvider } = jest.requireActual('ethers/providers');
  const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
  provider.pollingInterval = 10;
  const signer = (wallet ?? makeWallet()).connect(provider);
  const address = signer.address as Address;
  const log = logging.getLogger(`raiden:${address}`);

  Object.assign(provider, { _network: network });
  jest.spyOn(provider, 'on');
  jest.spyOn(provider as any, '_doPoll').mockImplementation(() => undefined);
  jest.spyOn(provider, 'removeListener');
  jest.spyOn(provider, 'listenerCount');
  jest.spyOn(provider, 'getNetwork').mockImplementation(async () => provider.network);
  jest.spyOn(provider, 'resolveName').mockImplementation(async (addressOrName) => addressOrName);
  jest.spyOn(provider, 'send').mockImplementation(async (method) => {
    if (method === 'net_version') return network.chainId;
    throw new Error(`provider.send called: "${method}"`);
  });
  jest
    .spyOn(provider, 'getCode')
    .mockImplementation((addr) => (console.trace('getCode called', addr), Promise.resolve('')));
  jest.spyOn(provider, 'getBlock');
  jest.spyOn(provider, 'getTransaction');
  jest.spyOn(provider, 'listAccounts').mockResolvedValue([address]);
  // See: https://github.com/cartant/rxjs-marbles/issues/11
  jest.spyOn(provider, 'getBlockNumber').mockImplementation(async () => provider.blockNumber);
  jest
    .spyOn(provider, 'getTransactionReceipt')
    .mockImplementation(
      async (txHash: string) => ({ txHash, confirmations: 6, blockNumber: undefined } as any),
    );
  // use provider.resetEventsBlock used to set current block number for provider
  jest
    .spyOn(provider, 'resetEventsBlock')
    .mockImplementation((n: number) => Object.assign(provider, { _fastBlockNumber: n }));
  // mockEthersEventEmitter(provider);
  provider.on('block', (n: number) => provider.resetEventsBlock(n));

  const logs: Log[] = [];
  const origEmit = provider.emit;
  jest.spyOn(provider, 'emit').mockImplementation((event: EventType, ...args: any[]) => {
    if (typeof event !== 'string' && !Array.isArray(event)) logs.push(args[0] as Log);
    return origEmit.call(provider, event, ...args);
  });
  jest.spyOn(provider, 'getLogs').mockImplementation(async (filter: Filter) => {
    return logs.filter((log) => {
      if (filter.address && filter.address !== log.address) return false;
      if (
        filter.topics &&
        !filter.topics.every(
          (f, i) =>
            f == null ||
            f === log.topics[i] ||
            (Array.isArray(f) && f.some((f1) => f1 === log.topics[i])),
        )
      )
        return false;
      if (filter.fromBlock && log.blockNumber! < filter.fromBlock) return false;
      if (typeof filter.toBlock === 'number' && log.blockNumber! > filter.toBlock!) return false;
      return true;
    });
  });
  provider.resetEventsBlock(100);

  const registryContract = TokenNetworkRegistryFactory.connect(
    registryAddress,
    signer,
  ) as MockedContract<TokenNetworkRegistry>;
  for (const func in registryContract.functions) {
    jest.spyOn(registryContract.functions, func as keyof TokenNetworkRegistry['functions']);
  }
  registryContract.functions.token_to_token_networks.mockImplementation(async () => makeAddress());

  const getTokenNetworkContract = memoize(
    (address: string): MockedContract<TokenNetwork> => {
      const tokenNetworkContract = TokenNetworkFactory.connect(address, signer) as MockedContract<
        TokenNetwork
      >;
      for (const func in tokenNetworkContract.functions) {
        jest.spyOn(tokenNetworkContract.functions, func as keyof TokenNetwork['functions']);
      }
      tokenNetworkContract.functions.getChannelParticipantInfo.mockResolvedValue([
        Zero,
        Zero,
        false,
        HashZero,
        Zero,
        HashZero,
        Zero,
      ]);
      tokenNetworkContract.functions.openChannel.mockResolvedValue(makeTransaction());
      tokenNetworkContract.functions.setTotalDeposit.mockResolvedValue(makeTransaction());
      tokenNetworkContract.functions.closeChannel.mockResolvedValue(makeTransaction());
      tokenNetworkContract.functions.updateNonClosingBalanceProof.mockResolvedValue(
        makeTransaction(),
      );
      tokenNetworkContract.functions.settleChannel.mockResolvedValue(makeTransaction());
      tokenNetworkContract.functions.unlock.mockResolvedValue(makeTransaction());
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
      tokenContract.functions.approve.mockResolvedValue(makeTransaction());
      tokenContract.functions.allowance.mockResolvedValue(Zero);
      return tokenContract;
    },
  );

  const serviceRegistryContract = ServiceRegistryFactory.connect(
    serviceRegistryAddress,
    signer,
  ) as MockedContract<ServiceRegistry>;
  for (const func in serviceRegistryContract.functions) {
    jest.spyOn(serviceRegistryContract.functions, func as keyof ServiceRegistry['functions']);
  }
  serviceRegistryContract.functions.token.mockResolvedValue(svtAddress);
  serviceRegistryContract.functions.urls.mockImplementation(async () => 'https://pfs.raiden.test');

  const userDepositContract = UserDepositFactory.connect(udcAddress, signer) as MockedContract<
    UserDeposit
  >;
  for (const func in userDepositContract.functions) {
    jest.spyOn(userDepositContract.functions, func as keyof UserDeposit['functions']);
  }
  userDepositContract.functions.one_to_n_address.mockResolvedValue(oneToNAddress);
  userDepositContract.functions.balances.mockResolvedValue(parseEther('5'));
  userDepositContract.functions.total_deposit.mockResolvedValue(parseEther('5'));
  userDepositContract.functions.effectiveBalance.mockResolvedValue(parseEther('5'));
  userDepositContract.functions.withdraw_plans.mockResolvedValue({
    amount: Zero,
    withdraw_block: Zero,
    0: Zero,
    1: Zero,
  });

  const secretRegistryContract = SecretRegistryFactory.connect(address, signer) as MockedContract<
    SecretRegistry
  >;

  for (const func in secretRegistryContract.functions) {
    jest.spyOn(secretRegistryContract.functions, func as keyof SecretRegistry['functions']);
  }

  const monitoringServiceContract = MonitoringServiceFactory.connect(
    address,
    signer,
  ) as MockedContract<MonitoringService>;

  for (const func in monitoringServiceContract.functions) {
    jest.spyOn(monitoringServiceContract.functions, func as keyof MonitoringService['functions']);
  }

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
    SecretRegistry: {
      address: secretRegistryContract.address as Address,
      block_number: 102,
    },
    MonitoringService: {
      address: monitoringServiceContract.address as Address,
      block_number: 102,
    },
  };

  const defaultConfig = makeDefaultConfig(
    { network },
    {
      // matrixServerLookup: 'https://matrixLookup.raiden.test',
      matrixServer: 'https://matrix.raiden.test',
      pfsSafetyMargin: 1.1,
      pfs: 'pfs.raiden.test',
      httpTimeout: 300,
      settleTimeout: 60,
      revealTimeout: 50,
      confirmationBlocks: 5,
    },
  );
  const latest$ = new ReplaySubject<Latest>(1);
  const config$ = latest$.pipe(pluckDistinct('config'));

  const deps = {
    latest$,
    config$,
    matrix$: new AsyncSubject<MatrixClient>(),
    address,
    log,
    defaultConfig,
    network,
    contractsInfo,
    provider,
    signer,
    registryContract,
    getTokenNetworkContract,
    getTokenContract,
    serviceRegistryContract,
    userDepositContract,
    secretRegistryContract,
    monitoringServiceContract,
  };

  const initialState = makeInitialState(
    { network, address, contractsInfo },
    { blockNumber: provider.blockNumber },
  );

  const epicMiddleware = createEpicMiddleware<
    RaidenAction,
    RaidenAction,
    RaidenState,
    RaidenEpicDeps
  >({ dependencies: deps });
  const output: RaidenAction[] = [];
  const store = createStore(
    raidenReducer,
    initialState as any,
    applyMiddleware(epicMiddleware, () => (next) => (action) => {
      // don't output before starting, so we can change state without side-effects
      if (raiden.started) {
        output.push(action);
        log.debug(`[${address}] action$:`, action);
      }
      return next(action);
    }),
  );

  const raiden: MockedRaiden = {
    address,
    store,
    deps,
    output,
    config: defaultConfig,
    start: async () => {
      if (raiden.started !== undefined) return;
      raiden.started = true;
      raiden.deps.config$.subscribe(
        (config) => (raiden.config = config),
        undefined,
        () => (raiden.started = false),
      );
      epicMiddleware.run(raidenRootEpic);
      await raiden.deps.latest$
        .pipe(
          filter(({ state }) => state.blockNumber >= raiden.deps.provider.blockNumber),
          take(1),
        )
        .toPromise();
      // raiden.store.dispatch(newBlock({ blockNumber: provider.blockNumber }));
    },
    started: undefined,
    stop: () => {
      raiden.deps.provider.removeAllListeners();
      raiden.store.dispatch(raidenShutdown({ reason: ShutdownReason.STOP }));
      const idx = mockedClients.indexOf(raiden);
      if (idx >= 0) mockedClients.splice(idx, 1);
    },
  };

  mockedClients.push(raiden);
  mockedCleanups.push(raiden.stop);

  if (start) {
    await raiden.start();
  }
  return raiden;
}

const cachedWallets = Array.from({ length: 3 }, makeWallet);

/**
 * Create multiple mocked clients
 *
 * @param length - Number of clients to create
 * @param start - Automatically starts the client if set too true (default)
 * @returns Array of mocked clients
 */
export async function makeRaidens(length: number, start = true): Promise<MockedRaiden[]> {
  return Promise.all(Array.from({ length }, (_, i) => makeRaiden(cachedWallets[i], start)));
}

/**
 * Asynchronously wait for some time
 *
 * @param ms - milliseconds to wait
 * @returns Promise to void
 */
export async function sleep(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(() => process.nextTick(resolve), ms));
}

/**
 * Emit an event to all currently mocked providers
 *
 * @param eventName - event name or filter
 * @param args - event args
 * @returns Promise which resolves when we detect these providers detected event
 */
export async function providersEmit(eventName: EventType, ...args: any[]): Promise<void> {
  const promise = Promise.all(
    mockedClients.map((r) => new Promise((resolve) => r.deps.provider.once(eventName, resolve))),
  );
  mockedClients.forEach((r) => r.deps.provider.emit(eventName, ...args));
  await promise;
}

/**
 * Emit blocks to all connected providers
 *
 * @param block - block number to be emitted, or else increment by one
 * @returns Promise resolved after all mockedClients fetch block
 */
export async function waitBlock(block?: number): Promise<void> {
  if (!block) block = mockedClients[0].deps.provider.blockNumber + 1;
  const promise = Promise.all(
    mockedClients.map((r) =>
      r.deps.latest$
        .pipe(
          filter(({ state }) => state.blockNumber >= block!),
          take(1),
        )
        .toPromise(),
    ),
  );
  await providersEmit('block', block);
  await promise;
}
