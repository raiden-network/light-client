/* eslint-disable @typescript-eslint/no-explicit-any */
import { patchEthersDefineReadOnly, patchEthersGetNetwork, patchVerifyMessage } from './patches';
patchVerifyMessage();
patchEthersDefineReadOnly();
patchEthersGetNetwork();

import { AsyncSubject, of, BehaviorSubject, ReplaySubject, Observable } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { MatrixClient } from 'matrix-js-sdk';
import { EventEmitter } from 'events';
import { memoize } from 'lodash';
import logging from 'loglevel';
import { Store, createStore, applyMiddleware } from 'redux';

// TODO: remove this mock
jest.mock('@ethersproject/providers');
import {
  Web3Provider,
  JsonRpcProvider,
  EventType,
  Listener,
  ExternalProvider,
} from '@ethersproject/providers';
import { Zero, HashZero } from '@ethersproject/constants';
import type { Log, Filter } from '@ethersproject/providers';
import type { FilterByBlockHash } from '@ethersproject/abstract-provider';
import type { Network } from '@ethersproject/networks';
import { parseEther } from '@ethersproject/units';
import { getAddress } from '@ethersproject/address';
import { randomBytes } from '@ethersproject/random';
import { Wallet, verifyMessage } from '@ethersproject/wallet';
import { keccak256 } from '@ethersproject/keccak256';
import { hexlify } from '@ethersproject/bytes';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract, EventFilter, ContractTransaction } from '@ethersproject/contracts';
import PouchDB from 'pouchdb';

jest.mock('raiden-ts/messages/utils', () => ({
  ...jest.requireActual<any>('raiden-ts/messages/utils'),
  signMessage: jest.fn(jest.requireActual<any>('raiden-ts/messages/utils').signMessage),
}));
import { signMessage } from 'raiden-ts/messages/utils';
export const originalSignMessage = jest.requireActual<any>('raiden-ts/messages/utils').signMessage;
export const mockedSignMessage = signMessage as jest.MockedFunction<typeof signMessage>;

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
import { Address, Signature, UInt, Hash, decode, Secret } from 'raiden-ts/utils/types';
import { getServerName } from 'raiden-ts/utils/matrix';
import { pluckDistinct } from 'raiden-ts/utils/rx';
import { raidenConfigUpdate, RaidenAction, raidenShutdown } from 'raiden-ts/actions';
import { makeDefaultConfig, RaidenConfig } from 'raiden-ts/config';
import { getSecrethash, makeSecret } from 'raiden-ts/transfers/utils';
import { raidenReducer } from 'raiden-ts/reducer';
import { ShutdownReason, Capabilities } from 'raiden-ts/constants';
import { createEpicMiddleware } from 'redux-observable';
import { raidenRootEpic } from 'raiden-ts/epics';
import { migrateDatabase, putRaidenState, getRaidenState } from 'raiden-ts/db/utils';
import { RaidenDatabaseConstructor } from 'raiden-ts/db/types';
import { getNetworkName } from 'raiden-ts/utils/ethers';
import { createPersisterMiddleware } from 'raiden-ts/persister';

const RaidenPouchDB = PouchDB.defaults({
  adapter: 'memory',
  log: logging,
} as any) as RaidenDatabaseConstructor;

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
  callStatic: {
    [K in keyof T['callStatic']]: jest.MockInstance<
      ReturnType<T['callStatic'][K]> extends Promise<ContractTransaction>
        ? Promise<MockedTransaction>
        : ReturnType<T['callStatic'][K]>,
      Parameters<T['callStatic'][K]>
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
 * Flush promises
 *
 * @returns Promise to be resolved after all pending ones were finished
 */
export async function flushPromises() {
  return new Promise(setImmediate);
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
    data: '0x',
    transactionHash: makeHash(),
    logIndex: 1,
    ...opts,
    address: filter.address!,
    topics: filter.topics as string[],
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
    gasLimit: BigNumber.from(1e5),
    gasPrice: BigNumber.from(1e9),
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
    sendToDevice: jest.fn(async () => true),
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
    send: jest.fn(),
  }) as unknown) as jest.Mocked<RTCDataChannel & EventEmitter>;

  const rtcConnection = (Object.assign(new EventEmitter(), {
    createDataChannel: jest.fn(() => rtcDataChannel),
    createOffer: jest.fn(async () => ({ type: 'offer', sdp: 'offerSdp' })),
    createAnswer: jest.fn(async () => ({ type: 'answer', sdp: 'answerSdp' })),
    setLocalDescription: jest.fn(async () => {
      /* local */
    }),
    setRemoteDescription: jest.fn(async () => {
      /* remote */
    }),
    addIceCandidate: jest.fn(),
    close: jest.fn(),
  }) as unknown) as jest.Mocked<RTCPeerConnection & EventEmitter>;

  const RTCPeerConnection = jest
    .spyOn(globalThis, 'RTCPeerConnection')
    .mockImplementation(() => rtcConnection);

  return { rtcDataChannel, rtcConnection, RTCPeerConnection };
}

// array of cleanup functions registered on current test
const mockedCleanups: (() => void)[] = [];

export const fetch = jest.fn<
  Promise<{
    ok: boolean;
    status: number;
    json: jest.MockedFunction<() => Promise<any>>;
    text?: jest.MockedFunction<() => Promise<string>>;
  }>,
  [string?]
>();
Object.assign(globalThis, { fetch });

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fetch.mockImplementation(async (_url?: string) => ({
    ok: true,
    status: 200,
    json: jest.fn(async () => undefined),
    text: jest.fn(async () => ''),
  }));
});

afterEach(async () => {
  let clean;
  while ((clean = mockedCleanups.pop())) clean();
  await sleep(10 * pollingInterval);
  await flushPromises();
  fetch.mockRestore();
});

// spyOn .on, .removeListener & .emit methods and replace with a synchronous simplified logic
function mockEthersEventEmitter(target: JsonRpcProvider | Contract): void {
  let listeners: Map<EventType, Set<Listener>> | null = new Map();

  function getEventTag(event: EventType): string {
    if (typeof event === 'string') return event;
    else if (Array.isArray(event)) return `filter::${event.join('|')}`;
    else if ('expiry' in event) return `filter::${event.expiry}`;
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

function spyContract(contract: Contract, rejectContractName?: string): void {
  for (const func in contract.functions) {
    const spied = jest.spyOn(contract, func);
    // if rejectContractName is set, use it as name for error if function gets called;
    // then functions which shouldn't be rejected should be mocked
    if (rejectContractName)
      spied.mockImplementation(async (...args: any[]) => {
        throw new Error(
          `${rejectContractName}: tried to call "${func}" with params ${JSON.stringify(args)}`,
        );
      });
    jest
      .spyOn(contract.callStatic, func)
      .mockImplementation(async (...args) => contract[func](...args));
    jest.spyOn(contract.functions, func).mockImplementation(async (...args) => {
      const res = await contract[func](...args);
      return Array.isArray(res) ? res : [res];
    });
  }
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
  jest
    .spyOn(provider, 'getLogs')
    .mockImplementation(
      async (filter_: Filter | FilterByBlockHash | Promise<Filter | FilterByBlockHash>) => {
        const filter = await filter_;
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
          if ('fromBlock' in filter && filter.fromBlock && log.blockNumber! < filter.fromBlock)
            return false;
          if (
            'toBlock' in filter &&
            typeof filter.toBlock === 'number' &&
            log.blockNumber! > filter.toBlock!
          )
            return false;
          return true;
        });
      },
    );
  mockEthersEventEmitter(provider);

  const signer = makeWallet().connect(provider);
  const address = signer.address as Address;
  const log = logging.getLogger(`raiden:${address}`);

  const registryAddress = '0xregistry';
  const registryContract = TokenNetworkRegistryFactory.connect(
    registryAddress,
    signer,
  ) as MockedContract<TokenNetworkRegistry>;
  spyContract(registryContract);
  registryContract.token_to_token_networks.mockImplementation(
    async (token: string) => token + 'Network',
  );

  const getTokenNetworkContract = memoize(
    (address: string): MockedContract<TokenNetwork> => {
      const tokenNetworkContract = TokenNetworkFactory.connect(address, signer) as MockedContract<
        TokenNetwork
      >;
      spyContract(tokenNetworkContract);
      tokenNetworkContract.getChannelParticipantInfo.mockResolvedValue([
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
      spyContract(tokenContract);
      tokenContract.allowance.mockResolvedValue(Zero);
      return tokenContract;
    },
  );

  const serviceRegistryContract = ServiceRegistryFactory.connect(
    registryAddress,
    signer,
  ) as MockedContract<ServiceRegistry>;
  spyContract(serviceRegistryContract);
  serviceRegistryContract.token.mockResolvedValue('0x0800000000000000000000000000000000000008');
  serviceRegistryContract.urls.mockImplementation(async () => 'https://pfs.raiden.test');

  const userDepositContract = UserDepositFactory.connect(address, signer) as MockedContract<
    UserDeposit
  >;

  spyContract(userDepositContract);

  userDepositContract.one_to_n_address.mockResolvedValue(oneToNAddress);
  userDepositContract.balances.mockResolvedValue(parseEther('5'));
  userDepositContract.total_deposit.mockResolvedValue(parseEther('5'));
  userDepositContract.deposit.mockResolvedValue(
    makeTransaction(undefined, { to: userDepositContract.address }),
  );
  userDepositContract.effectiveBalance.mockResolvedValue(parseEther('5'));
  userDepositContract.withdraw_plans.mockResolvedValue({
    amount: Zero,
    withdraw_block: Zero,
    0: Zero,
    1: Zero,
  });

  const secretRegistryContract = SecretRegistryFactory.connect(address, signer) as MockedContract<
    SecretRegistry
  >;

  spyContract(secretRegistryContract);

  const monitoringServiceContract = MonitoringServiceFactory.connect(
    address,
    signer,
  ) as MockedContract<MonitoringService>;

  spyContract(monitoringServiceContract);

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
      OneToN: {
        address: oneToNAddress,
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
        pollingInterval,
        httpTimeout: 300,
        confirmationBlocks: 2,
        caps: { [Capabilities.DELIVERY]: 0, [Capabilities.WEBRTC]: 0, [Capabilities.MEDIATE]: 1 },
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

  const dbName = [
    'raiden',
    getNetworkName(network),
    contractsInfo.TokenNetworkRegistry.address,
    address,
  ].join('_');
  const db = new RaidenPouchDB(dbName);
  Object.assign(db, { storageKeys: new Set<string>() });

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
    db,
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

function mockedMatrixCreateClient({
  baseUrl,
  userId: providedUserId,
}: {
  baseUrl: string;
  userId?: string;
}): jest.Mocked<MatrixClient> {
  const server = getServerName(baseUrl)!;
  let userId: string;
  let address: string;
  if (providedUserId) {
    userId = providedUserId;
    mockedMatrixUsers[providedUserId] = {
      userId: providedUserId,
      presence: 'offline',
    };
    address = getAddress(providedUserId.substr(1, 42));
  }

  let stopped: typeof mockedMatrixUsers[string] | undefined;
  return (Object.assign(new EventEmitter(), {
    startClient: jest.fn(async () => {
      if (!(userId in mockedMatrixUsers) && stopped) mockedMatrixUsers[userId] = stopped;
      stopped = undefined;
      mockedMatrixUsers[userId].presence = 'online';
    }),
    stopClient: jest.fn(() => {
      stopped = mockedMatrixUsers[userId];
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
        .map((u) => ({ user_id: u.userId, display_name: u.displayName, avatar_url: u.avatarUrl })),
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
      for (const client of mockedClients) {
        if (client.address === address) continue;
        const matrix = await client.deps.matrix$.toPromise();
        matrix.emit('event', { getType: () => 'm.presence', getSender: () => userId });
      }
    }),
    setPresence: jest.fn(async ({ presence }: { presence: string }) => {
      assert(userId in mockedMatrixUsers);
      mockedMatrixUsers[userId].presence = presence;
    }),
    createRoom: jest.fn(async ({ invite }) => {
      let pair = [address, '0x'];
      try {
        const peerAddr = getAddress((invite[0] as string).substr(1, 42));
        pair =
          address.toLowerCase() < peerAddr.toLowerCase()
            ? [address, peerAddr]
            : [peerAddr, address];
      } catch (e) {}
      return {
        room_id: `!roomId_${pair[0]}_${pair[1]}:${server}`,
        getMember: jest.fn(),
        getCanonicalAlias: jest.fn(() => null),
        getAliases: jest.fn(() => []),
      };
    }),
    getRoom: jest.fn((roomId) => ({
      roomId,
      getMember: jest.fn(() => ({ membership: 'join', roomId })),
      getCanonicalAlias: jest.fn(() => null),
      getAliases: jest.fn(() => []),
    })),
    getRooms: jest.fn(() => []),
    getHomeserverUrl: jest.fn(() => server),
    invite: jest.fn(async () => true),
    leave: jest.fn(async () => true),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sendEvent: jest.fn(async (roomId: string, type: string, content: any) => {
      const match = roomId.match(/0x[0-9a-f]{40}/gi);
      assert(address, 'matrix.sendEvent but client not started');
      if (!match || stopped) return true;
      const [p1, p2] = match;
      const partner = p1 === address ? p2 : p1;
      for (const client of mockedClients) {
        if (client.address !== partner) continue;
        const matrix = await client.deps.matrix$.toPromise();
        matrix.emit(
          'Room.timeline',
          {
            getType: jest.fn(() => type),
            getSender: jest.fn(() => userId),
            getContent: jest.fn(() => content),
            event: { type, sender: userId, content },
          },
          matrix.getRoom(roomId),
        );
      }
      logging.info('__sendEvent', address, roomId, type, content);
      return true;
    }),
    sendToDevice: jest.fn(
      async (type: string, contentMap: { [userId: string]: { [deviceID: string]: any } }) => {
        for (const [partnerId, map] of Object.entries(contentMap)) {
          for (const client of mockedClients) {
            const matrix = await client.deps.matrix$.toPromise();
            if (partnerId !== matrix.getUserId()) continue;
            for (const content of Object.values(map)) {
              matrix.emit('toDeviceEvent', {
                getType: jest.fn(() => type),
                getSender: jest.fn(() => userId),
                getContent: jest.fn(() => content),
                event: { type, sender: userId, content },
              });
              logging.info('__sendToDevice', address, type, content);
            }
          }
        }
      },
    ),
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
  action$: Observable<RaidenAction>;
  state$: Observable<RaidenState>;
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
const monitoringServiceAddress = makeAddress();
const secretRegistryAddress = makeAddress();
const pollingInterval = 10;

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
  // application specific logging, throwing an error, or other logic here
  debugger;
});

/**
 * Create a mock of a Raiden client for epics
 *
 * @param wallet - Use this wallet instead of generating a random one
 * @param start - Automatically starts the client if set too true (default)
 * @param initialState - Initial state
 * @returns Mocked Raiden Epics params
 */
export async function makeRaiden(
  wallet?: Wallet,
  start = true,
  initialState?: RaidenState,
): Promise<MockedRaiden> {
  const network: Network = { name: 'testnet', chainId: 1337 };
  const { Web3Provider } = jest.requireActual('@ethersproject/providers');
  const extProvider: ExternalProvider = {
    isMetaMask: true,
    request: async ({ method, params }) => {
      switch (method) {
        case 'net_version':
        case 'eth_chainId':
          return network.chainId;
        case 'eth_blockNumber':
          return provider.blockNumber ?? 0;
        default:
          throw new Error(`provider.send called: "${method}" => ${JSON.stringify(params)}`);
      }
    },
  };
  const provider = new Web3Provider(extProvider) as jest.Mocked<Web3Provider>;
  provider.pollingInterval = pollingInterval;
  const signer = (wallet ?? makeWallet()).connect(provider);
  const address = signer.address as Address;
  const log = logging.getLogger(`raiden:${address}`);

  Object.assign(provider, { _network: network });
  jest.spyOn(provider, 'on');
  jest.spyOn(provider, 'poll').mockImplementation(async () => undefined);
  jest.spyOn(provider, 'removeListener');
  jest.spyOn(provider, 'listenerCount');
  jest.spyOn(provider, 'resolveName').mockImplementation(async (addressOrName) => addressOrName);
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
      async (txHash: string | Promise<string>) =>
        ({ status: 1, txHash: await txHash, confirmations: 6, blockNumber: undefined } as any),
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
  jest
    .spyOn(provider, 'getLogs')
    .mockImplementation(
      async (filter_: Filter | FilterByBlockHash | Promise<Filter | FilterByBlockHash>) => {
        const filter = await filter_;
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
          if ('fromBlock' in filter && filter.fromBlock && log.blockNumber! < filter.fromBlock)
            return false;
          if (
            'toBlock' in filter &&
            typeof filter.toBlock === 'number' &&
            log.blockNumber! > filter.toBlock!
          )
            return false;
          return true;
        });
      },
    );
  provider.resetEventsBlock(100);

  const registryContract = TokenNetworkRegistryFactory.connect(
    registryAddress,
    signer,
  ) as MockedContract<TokenNetworkRegistry>;
  spyContract(registryContract, 'TokenNetworkRegistry');
  registryContract.token_to_token_networks.mockImplementation(async () => makeAddress());

  const getTokenNetworkContract = memoize(
    (address: string): MockedContract<TokenNetwork> => {
      const tokenNetworkContract = TokenNetworkFactory.connect(address, signer) as MockedContract<
        TokenNetwork
      >;
      spyContract(tokenNetworkContract, `TokenNetwork[${address}]`);
      tokenNetworkContract.getChannelParticipantInfo.mockResolvedValue([
        Zero,
        Zero,
        false,
        HashZero,
        Zero,
        HashZero,
        Zero,
      ]);
      tokenNetworkContract.openChannel.mockResolvedValue(
        makeTransaction(undefined, { to: address }),
      );
      tokenNetworkContract.setTotalDeposit.mockResolvedValue(
        makeTransaction(undefined, { to: address }),
      );
      tokenNetworkContract.setTotalWithdraw.mockResolvedValue(
        makeTransaction(undefined, { to: address }),
      );
      tokenNetworkContract.closeChannel.mockResolvedValue(
        makeTransaction(undefined, { to: address }),
      );
      tokenNetworkContract.updateNonClosingBalanceProof.mockResolvedValue(
        makeTransaction(undefined, { to: address }),
      );
      tokenNetworkContract.settleChannel.mockResolvedValue(
        makeTransaction(undefined, { to: address }),
      );
      tokenNetworkContract.unlock.mockResolvedValue(makeTransaction(undefined, { to: address }));
      return tokenNetworkContract;
    },
  );

  const getTokenContract = memoize(
    (address: string): MockedContract<HumanStandardToken> => {
      const tokenContract = HumanStandardTokenFactory.connect(address, signer) as MockedContract<
        HumanStandardToken
      >;
      spyContract(tokenContract, `Token[${address}]`);
      tokenContract.approve.mockResolvedValue(makeTransaction(undefined, { to: address }));
      tokenContract.allowance.mockResolvedValue(Zero);
      tokenContract.balanceOf.mockResolvedValue(parseEther('1000'));
      return tokenContract;
    },
  );

  const serviceRegistryContract = ServiceRegistryFactory.connect(
    serviceRegistryAddress,
    signer,
  ) as MockedContract<ServiceRegistry>;
  spyContract(serviceRegistryContract, 'ServiceRegistry');
  serviceRegistryContract.token.mockResolvedValue(svtAddress);
  serviceRegistryContract.urls.mockImplementation(async () => 'https://pfs.raiden.test');

  const userDepositContract = UserDepositFactory.connect(udcAddress, signer) as MockedContract<
    UserDeposit
  >;
  spyContract(userDepositContract, 'UserDeposit');
  userDepositContract.token.mockResolvedValue(svtAddress);
  userDepositContract.one_to_n_address.mockResolvedValue(oneToNAddress);
  userDepositContract.balances.mockResolvedValue(parseEther('5'));
  userDepositContract.total_deposit.mockResolvedValue(parseEther('5'));
  userDepositContract.effectiveBalance.mockResolvedValue(parseEther('5'));
  userDepositContract.withdraw_plans.mockResolvedValue({
    amount: Zero,
    withdraw_block: Zero,
    0: Zero,
    1: Zero,
  });

  const secretRegistryContract = SecretRegistryFactory.connect(
    secretRegistryAddress,
    signer,
  ) as MockedContract<SecretRegistry>;

  spyContract(secretRegistryContract, 'SecretRegistry');
  secretRegistryContract.registerSecret.mockImplementation(async (secret_) => {
    const secret = decode(Secret, secret_);
    const transactionHash = makeHash();
    providersEmit(
      {},
      makeLog({
        blockNumber: mockedClients[0].deps.provider.blockNumber + 1,
        transactionHash,
        filter: secretRegistryContract.filters.SecretRevealed(getSecrethash(secret), null),
        data: secret,
      }),
    );
    return makeTransaction(undefined, { from: address, hash: transactionHash, data: secret });
  });

  const monitoringServiceContract = MonitoringServiceFactory.connect(
    monitoringServiceAddress,
    signer,
  ) as MockedContract<MonitoringService>;

  spyContract(monitoringServiceContract, 'MonitoringService');

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
    OneToN: {
      address: oneToNAddress,
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
      pollingInterval,
      httpTimeout: 300,
      settleTimeout: 60,
      revealTimeout: 50,
      confirmationBlocks: 5,
      logger: 'debug',
      caps: { [Capabilities.DELIVERY]: 0, [Capabilities.WEBRTC]: 0, [Capabilities.MEDIATE]: 1 },
    },
  );
  const latest$ = new ReplaySubject<Latest>(1);
  const config$ = latest$.pipe(pluckDistinct('config'));

  const dbName = [
    'raiden',
    getNetworkName(network),
    contractsInfo.TokenNetworkRegistry.address,
    address,
  ].join('_');
  const db = await migrateDatabase.call(RaidenPouchDB, dbName);

  if (!initialState)
    try {
      initialState = decode(RaidenState, await getRaidenState(db));
    } catch (e) {}
  if (!initialState) {
    initialState = makeInitialState(
      { network, address, contractsInfo },
      { blockNumber: provider.blockNumber },
    );
    await putRaidenState(db, initialState);
  }

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
    db,
  };

  const epicMiddleware = createEpicMiddleware<
    RaidenAction,
    RaidenAction,
    RaidenState,
    RaidenEpicDeps
  >({ dependencies: deps });
  const output: RaidenAction[] = [];
  let lastTime = Date.now();
  const store = createStore(
    raidenReducer,
    initialState as any,
    applyMiddleware(
      epicMiddleware,
      () => (next) => (action) => {
        // don't output before starting, so we can change state without side-effects
        if (raiden.started) {
          output.push(action);
          const now = Date.now();
          log.debug(`[${address}] action$ (+${now - lastTime}ms):`, action);
          lastTime = now;
        }
        return next(action);
      },
      createPersisterMiddleware(db),
    ),
  );

  const state$ = latest$.pipe(pluckDistinct('state'));
  const action$ = latest$.pipe(pluckDistinct('action'));
  const raiden: MockedRaiden = {
    address,
    state$,
    action$,
    store,
    deps,
    output,
    config: defaultConfig,
    start: async () => {
      if (raiden.started !== undefined) return;
      raiden.started = true;
      raiden.deps.config$.subscribe({
        next: (config) => (raiden.config = config),
        complete: () => (raiden.started = false),
      });
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
      raiden.store.dispatch(raidenShutdown({ reason: ShutdownReason.STOP }));
      raiden.deps.provider.removeAllListeners();
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

/**
 * Create multiple mocked clients
 *
 * @param length - Number of clients to create
 * @param start - Automatically starts the client if set too true (default)
 * @returns Array of mocked clients
 */
export async function makeRaidens(length: number, start = true): Promise<MockedRaiden[]> {
  return Promise.all(Array.from({ length }, () => makeRaiden(undefined, start)));
}

/**
 * Asynchronously wait for some time
 *
 * @param ms - milliseconds to wait
 * @returns Promise to void
 */
export async function sleep(ms = pollingInterval): Promise<void> {
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
  await sleep(); // fromEthersEvent needs to debounce emits
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
