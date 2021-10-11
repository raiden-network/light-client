/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber } from '@ethersproject/bignumber';
import { hexlify } from '@ethersproject/bytes';
import { AddressZero, MaxUint256, One, Zero } from '@ethersproject/constants';
import { keccak256 } from '@ethersproject/keccak256';
import type { ExternalProvider, Network } from '@ethersproject/providers';
import { Formatter, JsonRpcProvider, Web3Provider } from '@ethersproject/providers';
import { randomBytes } from '@ethersproject/random';
import { Wallet } from '@ethersproject/wallet';
import { Contract } from 'ethers';
import memoize from 'lodash/memoize';
import logging from 'loglevel';
import type { MatrixClient } from 'matrix-js-sdk';
import type { Observable } from 'rxjs';
import {
  AsyncSubject,
  BehaviorSubject,
  EMPTY,
  firstValueFrom,
  lastValueFrom,
  of,
  ReplaySubject,
  Subject,
} from 'rxjs';
import {
  filter,
  first,
  ignoreElements,
  map,
  mapTo,
  mergeMap,
  mergeMapTo,
  pluck,
} from 'rxjs/operators';

import type { RaidenAction } from '@/actions';
import { raidenConfigUpdate, raidenShutdown, raidenStarted, raidenSynced } from '@/actions';
import {
  blockGasprice,
  channelClose,
  channelDeposit,
  channelOpen,
  channelSettle,
  tokenMonitored,
} from '@/channels/actions';
import type { Channel, ChannelEnd } from '@/channels/state';
import { ChannelState } from '@/channels/state';
import type { Lock } from '@/channels/types';
import { BalanceProofZero } from '@/channels/types';
import { channelAmounts, channelKey, channelUniqueKey } from '@/channels/utils';
import { makeDefaultConfig } from '@/config';
import { ShutdownReason, SignatureZero } from '@/constants';
import {
  CustomToken__factory,
  MonitoringService__factory,
  SecretRegistry__factory,
  ServiceRegistry__factory,
  TokenNetwork__factory,
  TokenNetworkRegistry__factory,
} from '@/contracts';
import { changes$, dumpDatabaseToArray } from '@/db/utils';
import { combineRaidenEpics } from '@/epics';
import { signMessage } from '@/messages';
import { messageServiceSend } from '@/messages/actions';
import type { LockedTransfer } from '@/messages/types';
import { MessageType } from '@/messages/types';
import { Raiden } from '@/raiden';
import { pathFind, udcDeposit, udcWithdraw, udcWithdrawPlan } from '@/services/actions';
import { Service } from '@/services/types';
import { pfsListInfo } from '@/services/utils';
import type { RaidenState } from '@/state';
import { makeInitialState } from '@/state';
import { transfer, transferSigned, withdraw, withdrawResolve } from '@/transfers/actions';
import { standardCalculator } from '@/transfers/mediate/types';
import type { TransferState } from '@/transfers/state';
import { Direction } from '@/transfers/state';
import {
  getLocksroot,
  getSecrethash,
  makeMessageId,
  makeSecret,
  transferKey,
} from '@/transfers/utils';
import { matrixPresence } from '@/transport/actions';
import type { ContractsInfo, Latest, RaidenEpicDeps } from '@/types';
import { assert } from '@/utils';
import { ErrorCodes, RaidenError } from '@/utils/error';
import { completeWith, pluckDistinct } from '@/utils/rx';
import type { Int, Secret, UInt } from '@/utils/types';
import { Address, timed } from '@/utils/types';

import { makeAddress, makeHash, makePublicKey, sleep } from '../utils';

jest.mock('@ethersproject/providers');
jest.mock('@/db/utils');

(changes$ as jest.MockedFunction<typeof changes$>).mockReturnValue(EMPTY);

export const fetch = jest.fn(async (_url?: string) => ({
  ok: true,
  status: 200,
  json: jest.fn(async () => undefined),
  text: jest.fn(async () =>
    JSON.stringify([
      {
        address: makeAddress(),
        capacity: 1,
        centrality: 2,
        score: 3,
        uptime: 4,
      },
    ]),
  ),
}));
Object.assign(globalThis, { fetch });

jest.mock('@/services/utils', () => ({
  ...jest.requireActual<any>('@/services/utils'),
  pfsListInfo: jest.fn(() => of(['abc', 'def'])),
}));

const MockedProvider = JsonRpcProvider as jest.MockedClass<typeof JsonRpcProvider>;

const wallet = new Wallet(hexlify(randomBytes(32)));
const address = wallet.address as Address;
const network: Network = { name: 'test', chainId: 1337 };
const contractsInfo: ContractsInfo = {
  TokenNetworkRegistry: { address: makeAddress(), block_number: 1 },
  ServiceRegistry: { address: makeAddress(), block_number: 1 },
  UserDeposit: { address: makeAddress(), block_number: 1 },
  SecretRegistry: { address: makeAddress(), block_number: 1 },
  MonitoringService: { address: makeAddress(), block_number: 1 },
  OneToN: { address: makeAddress(), block_number: 1 },
};
const txHash = makeHash();

const dummyState = makeInitialState({
  address,
  network,
  contractsInfo,
});

function dummyEpic(action$: Observable<RaidenAction>) {
  return action$.pipe(ignoreElements());
}

function dummyReducer(state: RaidenState = dummyState) {
  return state;
}

function makeDummyDependencies(): RaidenEpicDeps {
  const provider = new JsonRpcProvider();
  Object.assign(provider, {
    _isProvider: true,
    getNetwork: jest.fn(async () => network),
    getBalance: jest.fn(async () => BigNumber.from(1_000_000)),
    getGasPrice: jest.fn(async () => BigNumber.from(5)),
    getTransactionReceipt: jest.fn(async (txHash) => ({
      blockNumber: 118,
      confirmations: 11,
      transactionHash: txHash,
    })),
  });
  const signer = wallet.connect(provider);
  const latest$ = new ReplaySubject<Latest>(1);
  const config$ = latest$.pipe(pluckDistinct('config'));
  const matrix$ = new AsyncSubject<MatrixClient>();
  const db = {
    busy$: new BehaviorSubject(false),
    close: jest.fn(),
    storageKeys: new Set<string>(),
    get: jest.fn(),
  } as any;

  const defaultConfig = makeDefaultConfig({ network });
  const log = logging.getLogger(`raiden:${address}`);
  log.setLevel(logging.levels.INFO);

  return {
    latest$,
    config$,
    matrix$,
    provider,
    network,
    signer,
    address,
    log,
    defaultConfig,
    contractsInfo,
    registryContract: TokenNetworkRegistry__factory.connect(
      contractsInfo.TokenNetworkRegistry.address,
      signer,
    ),
    getTokenNetworkContract: memoize((address: Address) =>
      TokenNetwork__factory.connect(address, signer),
    ),
    getTokenContract: memoize(
      (_address: Address) =>
        ({
          signer: signer,
          functions: {
            transfer: jest.fn(async () => ({
              wait: jest.fn(async () => ({
                status: 1,
                transactionHash: txHash,
              })),
            })) as any,
          },
          callStatic: {
            balanceOf: jest.fn().mockResolvedValue(BigNumber.from(1_000_000)),
            totalSupply: jest.fn().mockResolvedValue(BigNumber.from(100_000_000)),
            decimals: jest.fn().mockResolvedValue(18),
            symbol: jest.fn().mockResolvedValue('TKN'),
            name: jest.fn().mockRejectedValue('not set'),
          },
        } as any),
    ),
    serviceRegistryContract: ServiceRegistry__factory.connect(
      contractsInfo.ServiceRegistry.address,
      signer,
    ),
    userDepositContract: {
      callStatic: {
        total_deposit: jest.fn(async () => BigNumber.from(123)),
        token: jest.fn(async () => makeAddress()),
      },
      withdraw_plans: jest.fn(async () => {
        return {
          amount: BigNumber.from(10) as UInt<32>,
          withdraw_block: BigNumber.from(223),
          block: BigNumber.from(123),
        };
      }),
    } as any,
    secretRegistryContract: SecretRegistry__factory.connect(
      contractsInfo.SecretRegistry.address,
      signer,
    ),
    monitoringServiceContract: MonitoringService__factory.connect(
      contractsInfo.MonitoringService.address,
      signer,
    ),
    db,
    init$: new ReplaySubject(),
    mediationFeeCalculator: standardCalculator,
  };
}

// makes an epic from a subject which just emits the actions to the state machine
function makePassthroughEpic(injected$: Subject<RaidenAction>) {
  return function passthroughEpic(action$: Observable<RaidenAction>) {
    return injected$.pipe(completeWith(action$));
  };
}

describe('Raiden', () => {
  const token = makeAddress();
  const tokenNetwork = makeAddress();
  const partner = makeAddress();
  const txBlock = 42;
  const transferAmount = 42;
  const channelId = 10;
  const settleTimeout = 500;
  const isFirstParticipant = true;
  const channelOpenHash = makeHash();
  const meta = { tokenNetwork, partner };
  const key = channelKey(meta);
  const deposit: BigNumber = BigNumber.from('10000000000000000000');
  const msgId = '123';
  const chainId = 1337;
  const updating_nonce = BigNumber.from(1) as UInt<8>;
  const other_nonce = BigNumber.from(1) as UInt<8>;
  const other_capacity = BigNumber.from(10) as UInt<32>;

  function initEpicMock(action$: Observable<RaidenAction>): Observable<RaidenAction> {
    return action$.pipe(
      filter(raidenStarted.is),
      mergeMapTo([
        blockGasprice({ gasPrice: BigNumber.from(5) as UInt<32> }),
        raidenSynced({
          tookMs: 9,
          initialBlock: 1,
          currentBlock: 10,
        }),
      ]),
    );
  }

  function UDCDepositEpicMock(action$: Observable<RaidenAction>) {
    return action$.pipe(
      filter(raidenStarted.is),
      mapTo(
        udcDeposit.success(
          {
            balance: BigNumber.from(42) as UInt<32>,
          },
          {
            totalDeposit: BigNumber.from(100) as UInt<32>,
          },
        ),
      ),
    );
  }

  const emptyChannelEnd: ChannelEnd = {
    address: AddressZero as Address,
    deposit: Zero as UInt<32>,
    withdraw: Zero as UInt<32>,
    locks: [],
    balanceProof: BalanceProofZero,
    pendingWithdraws: [],
    nextNonce: One as UInt<8>,
  };

  function getChannel(state: ChannelState = ChannelState.open): Channel {
    return {
      _id: channelUniqueKey({ ...meta, id: channelId }),
      id: channelId,
      state,
      token: token,
      tokenNetwork: tokenNetwork,
      settleTimeout: settleTimeout,
      isFirstParticipant: isFirstParticipant,
      openBlock: txBlock,
      own: {
        ...emptyChannelEnd,
        address,
      },
      partner: {
        ...emptyChannelEnd,
        address: partner,
      },
    } as Channel;
  }

  function getTransfer(
    initiator: Address,
  ): [transfer: LockedTransfer, fee: Int<32>, secret: Secret] {
    const paymentId = BigNumber.from(123) as UInt<8>;
    const secret = makeSecret();
    const secrethash = getSecrethash(secret);
    const fee = BigNumber.from(2) as Int<32>;
    const expiration = BigNumber.from(20) as UInt<32>;
    const amount = BigNumber.from(20).add(fee) as UInt<32>;
    const lock: Lock = {
      amount,
      expiration,
      secrethash,
    };
    const locksroot = getLocksroot([lock]);

    return [
      {
        type: MessageType.LOCKED_TRANSFER,
        message_identifier: makeMessageId(),
        chain_id: BigNumber.from(network.chainId) as UInt<32>,
        token_network_address: tokenNetwork,
        channel_identifier: BigNumber.from(channelId) as UInt<32>,
        nonce: BigNumber.from(1) as UInt<8>,
        transferred_amount: amount,
        locked_amount: amount,
        locksroot,
        payment_identifier: paymentId,
        token: token,
        recipient: partner,
        lock,
        target: partner,
        initiator,
        metadata: { routes: [] },
      },
      fee,
      secret,
    ];
  }

  const messageServiceSendRequestAction: messageServiceSend.request = messageServiceSend.request(
    {
      message: {
        type: MessageType.PFS_CAPACITY_UPDATE,
        updating_participant: address,
        other_participant: partner,
        signature: SignatureZero,
        updating_nonce,
        other_nonce,
        updating_capacity: deposit as UInt<32>,
        other_capacity,
        reveal_timeout: BigNumber.from(50) as UInt<32>,
        canonical_identifier: {
          chain_identifier: BigNumber.from(chainId) as UInt<32>,
          token_network_address: tokenNetwork,
          channel_identifier: BigNumber.from(channelId) as UInt<32>,
        },
      },
    },
    { service: Service.PFS, msgId },
  );

  const messageServiceSendSuccessAction: messageServiceSend.success = messageServiceSend.success(
    { via: '!.:', tookMs: 10, retries: 1 },
    { service: Service.PFS, msgId },
  );

  test('address', () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([dummyEpic]), dummyReducer);
    expect(raiden.address).toBe(dummyState.address);
  });

  test('start & synced', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    expect(raiden.network).toEqual({ name: 'test', chainId: 1337 });
    expect(raiden.log).toMatchObject({ name: `raiden:${raiden.address}` });
    expect(raiden.started).toBeUndefined();
    const startPromise = raiden.start();
    await expect(raiden.synced).resolves.toEqual({
      tookMs: expect.any(Number),
      initialBlock: expect.any(Number),
      currentBlock: expect.any(Number),
    });
    await expect(startPromise).resolves.toBeUndefined();
    expect(raiden.started).toEqual(true);
  });

  test('stop', async () => {
    const deps = makeDummyDependencies();

    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    await expect(raiden.start()).resolves.toBeUndefined();
    expect(raiden.started).toEqual(true);
    const lastPromise = lastValueFrom(raiden.action$);
    await expect(raiden.stop()).resolves.toBeUndefined();
    await expect(lastPromise).resolves.toEqual(raidenShutdown({ reason: ShutdownReason.STOP }));
    expect(raiden.started).toBe(false);
  });

  test('updateConfig', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    await expect(raiden.start()).resolves.toBeUndefined();
    const configPromise = firstValueFrom(raiden.action$.pipe(first(raidenConfigUpdate.is)));
    const mediationFees = { [token]: { flat: 400 } };
    raiden.updateConfig({ mediationFees });
    await expect(configPromise).resolves.toEqual(
      raidenConfigUpdate(
        expect.objectContaining({
          mediationFees: { [token]: { flat: 400 } },
        }),
      ),
    );
  });

  test('monitorToken', async () => {
    const deps = makeDummyDependencies();
    deps.registryContract = {
      token_to_token_networks: jest.fn(async () => tokenNetwork),
    } as any;
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    await expect(raiden.start()).resolves.toBeUndefined();
    const monitorTokenPromise = firstValueFrom(raiden.action$.pipe(first(tokenMonitored.is)));
    await expect(raiden.monitorToken(token.toString())).resolves.toEqual(tokenNetwork);
    await expect(monitorTokenPromise).resolves.toEqual(
      tokenMonitored({
        token,
        tokenNetwork,
        fromBlock: 1,
      }),
    );
  });

  test('getAvailability', async () => {
    function matrixPresenceEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        filter(matrixPresence.request.is),
        mapTo(
          matrixPresence.success(
            {
              userId: 'John Doe',
              available: true,
              ts: 12345,
              pubkey: makePublicKey(),
            },
            { address: partner },
          ),
        ),
      );
    }
    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics([initEpicMock, matrixPresenceEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();

    const payload = firstValueFrom(
      raiden.action$.pipe(first(matrixPresence.success.is), pluck('payload')),
    );

    raiden.getAvailability(partner);
    await expect(payload).resolves.toEqual(
      expect.objectContaining({ userId: 'John Doe', available: true, ts: 12345 }),
    );
  });

  test('getUDCCapacity', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics([initEpicMock, UDCDepositEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();

    const balance = await raiden.getUDCCapacity();
    expect(balance).toEqual(BigNumber.from(42));
  });

  test('getUDCTotalCapacity', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics([initEpicMock, UDCDepositEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();

    const balance = await raiden.getUDCTotalDeposit();
    expect(balance).toEqual(BigNumber.from(100));
  });

  test('depositToUDC', async () => {
    const amount = 10;

    function udcDepositEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        filter(udcDeposit.request.is),
        mapTo(
          udcDeposit.success(
            {
              balance: BigNumber.from(amount) as UInt<32>,
            },
            {
              totalDeposit: BigNumber.from(0) as UInt<32>,
            },
          ),
        ),
      );
    }

    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics([initEpicMock, udcDepositEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();

    const payload = firstValueFrom(
      raiden.action$.pipe(
        first(udcDeposit.success.is),
        map((e) => e.payload),
      ),
    );

    raiden.depositToUDC(amount);
    await expect(payload).resolves.toEqual(
      expect.objectContaining({ balance: BigNumber.from(amount) }),
    );
  });

  test('getUDCWithdrawPlan', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    await expect(raiden.start()).resolves.toBeUndefined();

    const withdrawPlan = await raiden.getUDCWithdrawPlan();
    expect(withdrawPlan).toEqual(
      expect.objectContaining({
        amount: BigNumber.from(10),
        block: 223,
        ready: false,
      }),
    );
  });

  test('planUDCWithdraw', async () => {
    const withdrawAmount = 10;
    const withdrawBlock = 123;
    function udcWithdrawEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        filter(udcWithdrawPlan.request.is),
        mapTo(
          udcWithdrawPlan.success(
            {
              block: withdrawBlock,
            },
            {
              amount: BigNumber.from(withdrawAmount) as UInt<32>,
            },
          ),
        ),
      );
    }

    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics([initEpicMock, udcWithdrawEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();

    const payload = firstValueFrom(
      raiden.action$.pipe(
        first(udcWithdrawPlan.success.is),
        map((e) => e.payload),
      ),
    );

    raiden.planUDCWithdraw(withdrawBlock);
    await expect(payload).resolves.toEqual(expect.objectContaining({ block: withdrawBlock }));
  });

  test('withdrawFromUDC', async () => {
    const withdrawAmount = 10;

    function udcWithdrawEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        filter(udcWithdraw.request.is),
        map((action) =>
          udcWithdraw.success(
            {
              withdrawal: BigNumber.from(withdrawAmount) as UInt<32>,
              beneficiary: address,
              txHash: txHash,
              txBlock: txBlock,
              confirmed: true,
            },
            action.meta,
          ),
        ),
      );
    }
    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      makeInitialState(
        { address, network, contractsInfo },
        { config: { autoUDCWithdraw: false }, blockNumber: txBlock + 200 },
      ),
      deps,
      combineRaidenEpics([initEpicMock, udcWithdrawEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();

    const payload = firstValueFrom(
      raiden.action$.pipe(
        first(udcWithdraw.success.is),
        map((e) => e.payload),
      ),
    );

    raiden.withdrawFromUDC(withdrawAmount);
    await expect(payload).resolves.toEqual(
      expect.objectContaining({
        withdrawal: BigNumber.from(withdrawAmount),
        txBlock: txBlock,
        confirmed: true,
      }),
    );
  });

  test('findPFS', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      makeInitialState(
        { address, network, contractsInfo },
        { config: { additionalServices: ['pfs1'] }, services: { pfs2: 1 } },
      ),
      deps,
      combineRaidenEpics([initEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();

    const pfsList = raiden.findPFS();
    await expect(pfsList).resolves.toEqual(['abc', 'def']);

    const mockedPfsListInfo = pfsListInfo as jest.MockedFunction<typeof pfsListInfo>;
    expect(mockedPfsListInfo.mock.calls[0][0]).toEqual(['pfs1', 'pfs2']);
  });

  test('directRoute/findRoutes', async () => {
    const fee = BigNumber.from(2);

    function pfsRequestEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        filter(pathFind.request.is),
        map((action) =>
          pathFind.success(
            {
              paths: [{ path: [raiden.address, partner], fee: fee as Int<32> }],
            },
            action.meta,
          ),
        ),
      );
    }

    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      makeInitialState({ address, network, contractsInfo }, { tokens: { [token]: tokenNetwork } }),
      deps,
      combineRaidenEpics([initEpicMock, pfsRequestEpicMock]),
      dummyReducer,
    );
    await raiden.start();
    await raiden.monitorToken(token);

    const expectedRoute = expect.arrayContaining([
      expect.objectContaining({
        path: [raiden.address, partner],
        fee: fee,
      }),
    ]);

    const route = raiden.directRoute(token, partner, transferAmount);
    await expect(route).resolves.toEqual(expectedRoute);

    const route2 = raiden.findRoutes(token, partner, transferAmount);
    await expect(route2).resolves.toEqual(expectedRoute);
  });

  test('openChannel', async () => {
    const channelDepositHash = makeHash();

    function channelOpenSuccessReducer(
      state: RaidenState = dummyState,
      action: RaidenAction,
    ): RaidenState {
      if (!channelOpen.success.is(action) || !action.payload.confirmed) return state;
      const key = channelKey(action.meta);
      const channel: Channel = {
        _id: channelUniqueKey({ ...action.meta, id: action.payload.id }),
        id: action.payload.id,
        state: ChannelState.open,
        token: action.payload.token,
        tokenNetwork: action.meta.tokenNetwork,
        settleTimeout: action.payload.settleTimeout,
        isFirstParticipant: action.payload.isFirstParticipant,
        openBlock: action.payload.txBlock,
        own: {
          ...emptyChannelEnd,
          address: state.address,
        },
        partner: {
          ...emptyChannelEnd,
          address: action.meta.partner,
        },
      };
      return { ...state, channels: { ...state.channels, [key]: channel } };
    }

    function channelOpenEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        filter(channelOpen.request.is),
        mergeMap((action) => [
          channelDeposit.request(
            { deposit: action.payload.deposit as UInt<32>, waitOpen: true },
            action.meta,
          ),
          channelOpen.success(
            {
              id: channelId,
              token,
              settleTimeout,
              isFirstParticipant,
              txHash: channelOpenHash,
              txBlock: 118,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          channelDeposit.success(
            {
              id: channelId,
              participant: address as Address,
              totalDeposit: deposit as UInt<32>,
              txHash: channelDepositHash,
              txBlock: 118,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          messageServiceSendRequestAction,
          messageServiceSendSuccessAction,
        ]),
      );
    }

    const deps = makeDummyDependencies();
    deps.registryContract = {
      token_to_token_networks: jest.fn(async () => tokenNetwork),
    } as any;
    const raiden = new Raiden(
      { ...dummyState, blockNumber: 129 },
      deps,
      combineRaidenEpics([initEpicMock, channelOpenEpicMock]),
      channelOpenSuccessReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();

    await expect(raiden.openChannel(token, partner, { settleTimeout, deposit })).resolves.toEqual(
      channelOpenHash,
    );
  });

  test('suggestPartners', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      makeInitialState({ address, network, contractsInfo }, { tokens: { [token]: tokenNetwork } }),
      deps,
      combineRaidenEpics([initEpicMock]),
      dummyReducer,
    );
    await raiden.start();
    await raiden.monitorToken(token);

    const suggestedPartners = raiden.suggestPartners(token);
    await expect(suggestedPartners).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: expect.toBeString(),
          capacity: BigNumber.from(1),
          centrality: 2,
          score: 3,
          uptime: 4,
        }),
      ]),
    );
  });

  test('getBalance/transferOnchainBalance', async () => {
    const deps = makeDummyDependencies();
    deps.signer = {
      sendTransaction: jest.fn(async () => ({
        wait: jest.fn(async () => ({
          status: 1,
        })),
        hash: txHash,
      })) as any,
    } as any;

    const raiden = new Raiden(
      makeInitialState({ address, network, contractsInfo }),
      deps,
      combineRaidenEpics([initEpicMock]),
      dummyReducer,
    );

    await raiden.start();

    const balance = raiden.getBalance();
    await expect(balance).resolves.toEqual(BigNumber.from(1_000_000));

    const mockedGetBalance = deps.provider.getBalance as jest.MockedFunction<
      typeof deps.provider.getBalance
    >;
    expect(mockedGetBalance.mock.calls[0][0]).toEqual(raiden.address);

    // Test transfering the complete balance
    const tx = raiden.transferOnchainBalance(partner);
    await expect(tx).resolves.toEqual(txHash);

    const mockedSendTransaction = deps.signer.sendTransaction as jest.MockedFunction<
      typeof deps.signer.sendTransaction
    >;
    expect(mockedSendTransaction.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        to: partner,
        value: BigNumber.from(1_000_000 - 5 * 21_000),
        gasPrice: BigNumber.from(5),
        gasLimit: BigNumber.from(21_000),
      }),
    );

    // Test transfering a specified amount
    const tx2 = raiden.transferOnchainBalance(partner, 1, { gasPrice: 1 });
    await expect(tx2).resolves.toEqual(txHash);

    expect(mockedSendTransaction.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        to: partner,
        value: BigNumber.from(1),
        gasPrice: BigNumber.from(1),
        gasLimit: BigNumber.from(21_000),
      }),
    );
  });

  test('getTokenBalance/transferOnchainTokens', async () => {
    const deps = makeDummyDependencies();
    const mockTokenContract = {
      signer: deps.signer,
      functions: {
        transfer: jest.fn(async () => ({
          wait: jest.fn(async () => ({
            status: 1,
            transactionHash: txHash,
          })),
        })),
      },
      callStatic: {
        balanceOf: jest.fn(async () => BigNumber.from(1_000_000)),
      },
    };
    const mockGetTokenContract = jest.fn(() => mockTokenContract);
    deps.getTokenContract = mockGetTokenContract as any;
    const raiden = new Raiden(
      makeInitialState({ address, network, contractsInfo }),
      deps,
      combineRaidenEpics([initEpicMock]),
      dummyReducer,
    );

    await raiden.start();

    const balance = raiden.getTokenBalance(token);
    await expect(balance).resolves.toEqual(BigNumber.from(1_000_000));

    const tokenContract = deps.getTokenContract(token);
    const mockedBalanceOf = tokenContract.callStatic.balanceOf as jest.MockedFunction<
      typeof tokenContract.callStatic.balanceOf
    >;
    expect(mockedBalanceOf.mock.calls[0][0]).toEqual(raiden.address);

    // Test transfering a specified amount of tokens
    const tx = raiden.transferOnchainTokens(token, partner, 1);
    await expect(tx).resolves.toEqual(txHash);

    const mockedTransfer = tokenContract.functions.transfer as jest.MockedFunction<
      typeof tokenContract.functions.transfer
    >;
    expect(mockedTransfer).toHaveBeenNthCalledWith(
      1,
      partner,
      One,
      expect.objectContaining({ gasPrice: expect.toBeBigNumber() }),
    );

    // Test transfering all tokens
    const tx2 = raiden.transferOnchainTokens(token, partner);
    await expect(tx2).resolves.toEqual(txHash);
    expect(mockedTransfer).toHaveBeenNthCalledWith(
      2,
      partner,
      BigNumber.from(1_000_000),
      expect.objectContaining({ gasPrice: expect.toBeBigNumber() }),
    );
  });

  test('getTokenList', async () => {
    const blockNumber = 110;

    // some mocks
    jest.spyOn(Formatter, 'arrayOf').mockImplementation(() => jest.fn((logs) => logs));
    MockedProvider.prototype.send.mockImplementation(async () => []);
    MockedProvider.prototype.send.mockImplementationOnce(async () => [{ blockNumber: 99 }]);
    Object.defineProperty(MockedProvider.prototype, 'formatter', {
      configurable: true,
      get: jest.fn().mockReturnValue({ filterLog: jest.fn((l) => l) }),
    });

    const deps = makeDummyDependencies();
    Object.assign(deps.provider, { blockNumber });
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);

    jest.spyOn(deps.registryContract.interface, 'parseLog').mockImplementation(
      () =>
        ({
          args: { token_address: token },
        } as any),
    );
    await expect(raiden.getTokenList()).resolves.toEqual([token]);
  });

  test('closeChannel', async () => {
    const closeBlock = 60;
    function channelCloseEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        mergeMap(function* (action) {
          if (withdrawResolve.is(action)) {
            yield withdraw.failure(new Error('can not coop-settle'), action.meta);
          } else if (channelClose.request.is(action)) {
            yield channelClose.success(
              {
                id: channelId,
                participant: address,
                txHash,
                txBlock: closeBlock,
                confirmed: true,
              },
              { tokenNetwork, partner },
            );
          }
        }),
      );
    }
    const deps = makeDummyDependencies();
    deps.registryContract = {
      token_to_token_networks: jest.fn(async () => tokenNetwork),
    } as any;
    const raiden = new Raiden(
      makeInitialState(
        { address, network, contractsInfo },
        { tokens: { [token]: tokenNetwork }, channels: { [key]: getChannel() } },
      ),
      deps,
      combineRaidenEpics([initEpicMock, channelCloseEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();
    const channelCloseRequestPromise = firstValueFrom(
      raiden.action$.pipe(first(channelClose.request.is)),
    );
    await expect(raiden.closeChannel(token, partner)).resolves.toEqual(txHash);
    await expect(channelCloseRequestPromise).resolves.toEqual(
      channelClose.request(undefined, meta),
    );
  });

  test('mainAddress', async () => {
    const mainAddress = makeAddress();
    const deps = makeDummyDependencies();
    Object.assign(deps, { main: { address: mainAddress } });
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    expect(raiden.mainAddress).toEqual(mainAddress);
  });

  test('getBlockNumber', async () => {
    const blockNumber = 1;
    const deps = makeDummyDependencies();
    Object.assign(deps.provider, { blockNumber });
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    await expect(raiden.getBlockNumber()).resolves.toEqual(blockNumber);
  });

  test('depositChannel', async () => {
    function channelDepositEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        filter(channelDeposit.request.is),
        mergeMap(() => {
          return of(
            channelDeposit.success(
              {
                id: channelId,
                participant: address as Address,
                totalDeposit: deposit as UInt<32>,
                txHash,
                txBlock: 118,
                confirmed: true,
              },
              { tokenNetwork, partner },
            ),
            messageServiceSendRequestAction,
            messageServiceSendSuccessAction,
          );
        }),
      );
    }
    const deps = makeDummyDependencies();
    deps.registryContract = {
      token_to_token_networks: jest.fn().mockImplementation(async () => tokenNetwork),
    } as any;

    const raiden = new Raiden(
      makeInitialState(
        { address, network, contractsInfo },
        { blockNumber: 129, tokens: { [token]: tokenNetwork }, channels: { [key]: getChannel() } },
      ),
      deps,
      combineRaidenEpics([initEpicMock, channelDepositEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();
    const channelDepositRequestPromise = firstValueFrom(
      raiden.action$.pipe(first(channelDeposit.request.is)),
    );
    await expect(raiden.depositChannel(token, partner, deposit)).resolves.toEqual(txHash);
    await expect(channelDepositRequestPromise).resolves.toEqual(
      channelDeposit.request({ deposit: deposit as UInt<32> }, meta),
    );
  });

  test('settleChannel', async () => {
    function channelSettleEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        filter(channelSettle.request.is),
        mapTo(
          channelSettle.success(
            { id: channelId, txHash, txBlock: 60, confirmed: true, locks: [] },
            { tokenNetwork, partner },
          ),
        ),
      );
    }
    const deps = makeDummyDependencies();
    deps.registryContract = {
      token_to_token_networks: jest.fn().mockImplementation(async () => tokenNetwork),
    } as any;

    const raiden = new Raiden(
      makeInitialState(
        { address, network, contractsInfo },
        {
          tokens: { [token]: tokenNetwork },
          channels: { [key]: getChannel(ChannelState.settleable) },
        },
      ),
      deps,
      combineRaidenEpics([initEpicMock, channelSettleEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();
    const channelSettleRequestPromise = firstValueFrom(
      raiden.action$.pipe(first(channelSettle.request.is)),
    );
    await expect(raiden.settleChannel(token, partner)).resolves.toEqual(txHash);
    await expect(channelSettleRequestPromise).resolves.toEqual(
      channelSettle.request(undefined, meta),
    );
  });

  test('withdrawChannel', async () => {
    const amount = BigNumber.from('3000000000000000000');
    const revealTimeout = 50;
    const deps = makeDummyDependencies();
    deps.registryContract = {
      token_to_token_networks: jest.fn().mockImplementation(async () => tokenNetwork),
    } as any;
    const ownEnd: ChannelEnd = {
      address,
      deposit: deposit as UInt<32>,
      withdraw: Zero as UInt<32>,
      locks: [],
      balanceProof: {
        ...BalanceProofZero,
        transferredAmount: BigNumber.from('2000000000000000000') as UInt<32>,
      },
      pendingWithdraws: [],
      nextNonce: One as UInt<8>,
    };
    const partnerEnd: ChannelEnd = {
      address: partner,
      deposit: Zero as UInt<32>,
      withdraw: Zero as UInt<32>,
      locks: [],
      balanceProof: BalanceProofZero,
      pendingWithdraws: [],
      nextNonce: One as UInt<8>,
    };
    const channel: Channel = {
      _id: channelUniqueKey({ ...meta, id: channelId }),
      id: channelId,
      state: ChannelState.open,
      token: token,
      tokenNetwork: tokenNetwork,
      settleTimeout: settleTimeout,
      isFirstParticipant: isFirstParticipant,
      openBlock: txBlock,
      own: ownEnd,
      partner: partnerEnd,
    };
    const { ownWithdraw } = channelAmounts(channel);
    const withdrawMeta = {
      direction: Direction.SENT,
      tokenNetwork,
      partner,
      totalWithdraw: ownWithdraw.add(amount) as UInt<32>,
      expiration: dummyState.blockNumber + 2 * revealTimeout,
    };
    function channelWithdrawEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        mergeMap(function* (action) {
          if (withdrawResolve.is(action)) {
            yield withdraw.request(action.payload, action.meta);
          } else if (withdraw.request.is(action)) {
            yield withdraw.success({ txHash, txBlock, confirmed: true }, withdrawMeta);
          }
        }),
      );
    }
    const raiden = new Raiden(
      makeInitialState(
        { address, network, contractsInfo },
        {
          tokens: { [token]: tokenNetwork },
          channels: { [key]: channel },
        },
      ),
      deps,
      combineRaidenEpics([initEpicMock, channelWithdrawEpicMock]),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();
    const withdrawRequestPromise = firstValueFrom(raiden.action$.pipe(first(withdraw.request.is)));
    await expect(raiden.withdrawChannel(token, partner, amount)).resolves.toEqual(txHash);
    await expect(withdrawRequestPromise).resolves.toEqual(
      withdraw.request(undefined, withdrawMeta),
    );
  });

  test('transfer', async () => {
    function transferEpicMock(action$: Observable<RaidenAction>) {
      return action$.pipe(
        filter(transfer.request.is),
        map((action) =>
          transferSigned(
            {
              message: signedMessage,
              fee,
              partner,
            },
            action.meta,
          ),
        ),
      );
    }

    const deps = makeDummyDependencies();
    const raiden: Raiden = new Raiden(
      makeInitialState(
        { address, network, contractsInfo },
        { tokens: { [token]: tokenNetwork }, channels: { [key]: getChannel() } },
      ),
      deps,
      combineRaidenEpics([initEpicMock, transferEpicMock]),
      dummyReducer,
    );

    const [lockedTransferMessage, fee, secret] = getTransfer(raiden.address);
    const signedMessage = await signMessage(deps.signer, lockedTransferMessage);
    await raiden.start();
    const transferRequestPromise = firstValueFrom(raiden.action$.pipe(first(transfer.request.is)));

    const transferResult = raiden.transfer(token, partner, 1, {
      paymentId: lockedTransferMessage.payment_identifier,
      secret,
      secrethash: lockedTransferMessage.lock.secrethash,
    });

    await expect(transferResult).resolves.toEqual(`sent:${lockedTransferMessage.lock.secrethash}`);
    await expect(transferRequestPromise).resolves.toEqual(
      transfer.request(
        expect.objectContaining({
          tokenNetwork: tokenNetwork,
          target: partner,
          value: One as UInt<32>,
          paymentId: lockedTransferMessage.payment_identifier,
        }),
        {
          secrethash: lockedTransferMessage.lock.secrethash,
          direction: Direction.SENT,
        },
      ),
    );
  });

  test('waitTransfer', async () => {
    const deps = makeDummyDependencies();
    deps.db.busy$.next(true); // disable db persistency
    // eslint-disable-next-line prefer-const
    let transferState!: TransferState;
    function dummyTransferReducer(
      state: RaidenState = dummyState,
      action: RaidenAction,
    ): RaidenState {
      if (transferSigned.is(action))
        return {
          ...state,
          transfers: {
            ...state.transfers,
            [transferKey(action.meta)]: transferState,
          },
        };
      if (!transfer.success.is(action)) return state;
      return {
        ...state,
        transfers: {
          ...state.transfers,
          [transferKey(action.meta)]: {
            ...state.transfers[transferKey(action.meta)],
            unlockProcessed: timed({} as any),
          },
        },
      };
    }
    const inject$ = new Subject<RaidenAction>();
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics([dummyEpic, initEpicMock, makePassthroughEpic(inject$)]),
      dummyTransferReducer,
    );
    await raiden.start();

    const [lockedTransfer, fee, secret] = getTransfer(raiden.address);
    const secrethash = lockedTransfer.lock.secrethash;
    const signedMessage = await signMessage(deps.signer, lockedTransfer);
    transferState = {
      _id: `${Direction.SENT}:${secrethash}`,
      channel: channelUniqueKey(getChannel()),
      direction: Direction.SENT,
      secrethash,
      expiration: 991,
      fee,
      partner,
      cleared: 0,
      transfer: timed(signedMessage),
      secret,
    };
    (deps.db.get as jest.Mock).mockImplementation(async () => {
      // when db.get, set transfer in state
      inject$.next(
        transferSigned(
          { message: signedMessage, fee, partner },
          {
            direction: transferState.direction,
            secrethash,
          },
        ),
      );
      return transferState;
    });

    const promise = raiden.waitTransfer(transferState._id);
    await sleep();
    inject$.next(transfer.success({}, { direction: Direction.SENT, secrethash }));

    await expect(promise).resolves.toMatchObject({
      status: 'UNLOCKED',
      changedAt: expect.any(Date),
    });
  });

  test('userDepositTokenAddress & getTokenInfo', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([dummyEpic]), dummyReducer);
    const svtAddress = await raiden.userDepositTokenAddress();
    expect(Address.is(svtAddress)).toBe(true);
    await raiden.userDepositTokenAddress(); // call again
    expect(
      deps.userDepositContract.callStatic.token as jest.MockedFunction<
        RaidenEpicDeps['userDepositContract']['callStatic']['token']
      >,
    ).toHaveBeenCalledTimes(1); // memoized

    await expect(raiden.getTokenInfo(svtAddress)).resolves.toEqual({
      totalSupply: BigNumber.from(100_000_000),
      decimals: 18,
      symbol: 'TKN',
      name: undefined, // name not defined doesn't error call
    });
  });

  test('mint', async () => {
    const deps = makeDummyDependencies();
    const beneficiary = makeAddress();
    const blockNumber = 119;
    const raiden = new Raiden(
      { ...dummyState, blockNumber },
      deps,
      combineRaidenEpics([dummyEpic]),
      dummyReducer,
    );
    const svtAddress = await raiden.userDepositTokenAddress();
    const svtContract = {
      address: svtAddress,
      functions: {
        mintFor: jest.fn(async () => ({
          hash: txHash,
          wait: jest.fn(async () => ({
            blockNumber: blockNumber - 1,
            status: 1,
            transactionHash: txHash,
          })),
        })),
      },
    } as any;
    const svtSpy = jest.spyOn(CustomToken__factory, 'connect').mockReturnValue(svtContract);

    await expect(raiden.mint(svtAddress, 10, { to: beneficiary })).resolves.toBe(txHash);
    expect(svtContract.functions.mintFor).toHaveBeenCalledWith(
      BigNumber.from(10),
      beneficiary,
      expect.anything(),
    );

    svtSpy.mockRestore();
  });

  test('registerToken', async () => {
    const deps = makeDummyDependencies();
    deps.registryContract = {
      ...deps.registryContract,
      functions: {
        createERC20TokenNetwork: jest.fn(async () => ({
          hash: txHash,
          wait: jest.fn(async () => ({
            blockNumber: blockNumber - 5,
            status: 1,
          })),
        })),
      },
    } as any;
    const blockNumber = 119;
    const raiden = new Raiden(
      { ...dummyState, blockNumber },
      deps,
      combineRaidenEpics([dummyEpic]),
      dummyReducer,
    );

    const tokenNetworkAddress = makeAddress();
    const monitorTokenMock = jest.fn();
    monitorTokenMock.mockReturnValueOnce(Promise.reject());
    monitorTokenMock.mockReturnValueOnce(Promise.resolve(tokenNetworkAddress));
    raiden.monitorToken = monitorTokenMock;

    await expect(raiden.registerToken(token)).resolves.toBe(tokenNetworkAddress);
    expect(deps.registryContract.functions.createERC20TokenNetwork).toHaveBeenCalledWith(
      token,
      MaxUint256,
      MaxUint256,
      expect.anything(),
    );
  });

  test('dumpDatabase', async () => {
    const mockDump = dumpDatabaseToArray as jest.MockedFunction<typeof dumpDatabaseToArray>;
    const result = [{ _id: '1', value: 345 }];
    mockDump.mockResolvedValue(result);

    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics([dummyEpic, initEpicMock]),
      dummyReducer,
    );
    await raiden.start();

    const promise = raiden.dumpDatabase();
    // test dump promise waits for raiden to be stopped
    await expect(
      Promise.race([promise, new Promise((resolve) => setTimeout(resolve, 10))]),
    ).resolves.toBeUndefined(); // timeout wins, promise pending
    raiden.stop(); // stop will cause it to continue
    await expect(promise).resolves.toBe(result);
    expect(mockDump).toHaveBeenCalled();
  });

  test('create', async () => {
    // -- MOCKS --
    const { contractsInfo } = makeDummyDependencies();
    const MockedRaiden = jest.fn(() => ({ address }));

    MockedProvider.mockClear();

    Object.defineProperty(MockedProvider.prototype, 'network', {
      configurable: true,
      get: jest.fn().mockReturnValue(network),
    });
    Object.defineProperty(MockedProvider.prototype, '_isProvider', {
      configurable: true,
      get: jest.fn().mockReturnValue(true),
    });
    Object.defineProperty(MockedProvider.prototype, 'formatter', {
      configurable: true,
      get: jest.fn().mockReturnValue({ filterLog: jest.fn((l) => l) }),
    });

    MockedProvider.prototype.getNetwork.mockImplementation(async () => network);
    const accounts: string[] = [address, makeAddress()];
    MockedProvider.prototype.listAccounts.mockImplementation(async () => accounts);
    MockedProvider.prototype.getBlockNumber.mockImplementation(async () => 123);
    MockedProvider.prototype.send.mockImplementation(async () => []);
    MockedProvider.prototype.getSigner.mockImplementation(function (
      this: typeof MockedProvider,
      indexOrAddress?: string | number,
    ) {
      assert(typeof indexOrAddress !== 'number' || indexOrAddress < accounts.length);
      assert(typeof indexOrAddress !== 'string' || accounts.includes(indexOrAddress));
      return {
        _isSigner: true,
        getAddress: jest.fn(async () =>
          typeof indexOrAddress === 'number' ? accounts[indexOrAddress] : indexOrAddress,
        ),
        provider: this,
      } as any;
    });
    // ensure Web3Provider is instanceof MockedProvider
    Object.assign(Web3Provider, { prototype: Object.create(MockedProvider.prototype) });
    Object.assign(Web3Provider.prototype, { constructor: Web3Provider });

    Object.assign(Contract.prototype, {
      msc_address: jest.fn(makeAddress),
      token_network_registry: jest.fn(makeAddress),
      secret_registry_address: jest.fn(makeAddress),
      service_registry: jest.fn(makeAddress),
      one_to_n_address: jest.fn(makeAddress),
    });
    (Formatter as jest.MockedClass<typeof Formatter>).arrayOf = jest.fn(() =>
      jest.fn((logs) => logs),
    );

    // -- TESTS --

    // test string-to-JsonRpcProvider, account by index, full contractsInfo
    await expect(
      Raiden.create.call(
        MockedRaiden as any, // pass RaidenMock as 'this' to static factory
        'http://test.provider', // JsonRpcProvider's url
        0, // first account
        { adapter: 'memory' },
        contractsInfo, // mocked contractsInfo
      ),
    ).resolves.toBeDefined();
    expect(MockedRaiden.mock.instances[0]).toBeObject();

    MockedProvider.mockClear();

    // test passing JsonRpcProvider instance, address & PK accounts
    const provider = new MockedProvider('http://test.provider');
    await expect(
      Raiden.create.call(
        MockedRaiden as any,
        provider, // constructed provider
        makeAddress(), // pass unknown address
        { adapter: 'memory' },
        contractsInfo,
      ),
    ).rejects.toThrowWithMessage(RaidenError, ErrorCodes.RDN_ACCOUNT_NOT_FOUND);
    await expect(
      Raiden.create.call(
        MockedRaiden as any,
        provider,
        '123', // invalid account rejects
        { adapter: 'memory' },
        contractsInfo,
      ),
    ).rejects.toThrowWithMessage(RaidenError, ErrorCodes.RDN_STRING_ACCOUNT_INVALID);
    await expect(
      Raiden.create.call(
        MockedRaiden as any,
        provider,
        accounts[1], // pass 2nd account directly as address
        { adapter: 'memory' },
        contractsInfo,
      ),
    ).resolves.toBeDefined();
    await expect(
      Raiden.create.call(
        MockedRaiden as any,
        provider,
        provider.getSigner(0), // pass signer instance connected to provider directly
        { adapter: 'memory' },
        contractsInfo,
      ),
    ).resolves.toBeDefined();
    await expect(
      Raiden.create.call(
        MockedRaiden as any,
        provider,
        // signer must be connected to provider, or it'll reject
        Object.assign(provider.getSigner(0), { provider: null as any }),
        { adapter: 'memory' },
        contractsInfo,
      ),
    ).rejects.toThrowWithMessage(RaidenError, ErrorCodes.RDN_SIGNER_NOT_CONNECTED);
    const privKey = keccak256([]); // hashes are valid private keys
    await expect(
      Raiden.create.call(
        MockedRaiden as any,
        provider,
        privKey, // pass raw private key creates Wallet
        { adapter: 'memory' },
        contractsInfo,
      ),
    ).resolves.toBeDefined();

    // test ExternalProvider, raw Wallet/PrivKey, fetch contracts from UDC, subkey
    const extProvider: ExternalProvider = {
      send: jest.fn(async () => '0x'),
    };
    const wallet = new Wallet(privKey);
    const udcAddress = makeAddress();
    MockedProvider.prototype.send.mockImplementationOnce(async () => [{ blockNumber: 99 }]);
    await expect(
      Raiden.create.call(
        MockedRaiden as any,
        extProvider, // external provider creates Web3Provider
        wallet, // wallet can be connected directly
        { adapter: 'memory' },
        udcAddress, // fetch contracts from UDC address
        undefined,
        true, // subkey
      ),
    ).resolves.toBeDefined();

    // test known network contracts
    (provider as jest.Mocked<JsonRpcProvider>).getNetwork.mockImplementation(async () => ({
      name: 'goerli',
      chainId: 5,
    }));
    await expect(
      Raiden.create.call(MockedRaiden as any, provider, wallet, { adapter: 'memory' }),
    ).resolves.toBeDefined();
  });
});
