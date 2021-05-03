/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber } from '@ethersproject/bignumber';
import { hexlify } from '@ethersproject/bytes';
import { AddressZero, One, Zero } from '@ethersproject/constants';
import type { Network } from '@ethersproject/providers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { randomBytes } from '@ethersproject/random';
import { Wallet } from '@ethersproject/wallet';
import memoize from 'lodash/memoize';
import logging from 'loglevel';
import type { MatrixClient } from 'matrix-js-sdk';
import type { Observable } from 'rxjs';
import { AsyncSubject, BehaviorSubject, of, ReplaySubject } from 'rxjs';
import { filter, first, ignoreElements, map, mapTo, mergeMap } from 'rxjs/operators';

import type { RaidenAction } from '@/actions';
import { raidenConfigUpdate, raidenShutdown, raidenStarted, raidenSynced } from '@/actions';
import { channelDeposit, channelOpen, tokenMonitored } from '@/channels/actions';
import type { Channel, ChannelEnd } from '@/channels/state';
import { ChannelState } from '@/channels/state';
import { BalanceProofZero } from '@/channels/types';
import { channelKey, channelUniqueKey } from '@/channels/utils';
import { makeDefaultConfig } from '@/config';
import { ShutdownReason, SignatureZero } from '@/constants';
import {
  HumanStandardToken__factory,
  MonitoringService__factory,
  SecretRegistry__factory,
  ServiceRegistry__factory,
  TokenNetwork__factory,
  TokenNetworkRegistry__factory,
} from '@/contracts';
import { combineRaidenEpics } from '@/epics';
import { messageServiceSend } from '@/messages/actions';
import { MessageType } from '@/messages/types';
import { Raiden } from '@/raiden';
import { pathFind, udcDeposit, udcWithdraw, udcWithdrawPlan } from '@/services/actions';
import { Service } from '@/services/types';
import { pfsListInfo } from '@/services/utils';
import type { RaidenState } from '@/state';
import { makeInitialState } from '@/state';
import { standardCalculator } from '@/transfers/mediate/types';
import { matrixPresence } from '@/transport/actions';
import type { ContractsInfo, Latest, RaidenEpicDeps } from '@/types';
import { pluckDistinct } from '@/utils/rx';
import type { Address, Int, UInt } from '@/utils/types';

import { makeAddress, makeHash } from '../utils';

jest.mock('@ethersproject/providers');

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
  Object.assign(provider, { _isProvider: true });
  const signer = wallet.connect(provider);
  const latest$ = new ReplaySubject<Latest>(1);
  const config$ = latest$.pipe(pluckDistinct('config'));
  const matrix$ = new AsyncSubject<MatrixClient>();
  const db = {
    busy$: new BehaviorSubject(false),
    close: jest.fn(),
    storageKeys: new Set<string>(),
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
    getTokenContract: memoize((address: Address) =>
      HumanStandardToken__factory.connect(address, signer),
    ),
    serviceRegistryContract: ServiceRegistry__factory.connect(
      contractsInfo.ServiceRegistry.address,
      signer,
    ),
    userDepositContract: {
      callStatic: {
        total_deposit: jest.fn(async () => BigNumber.from(123)),
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

describe('Raiden', () => {
  const token = makeAddress();
  const tokenNetwork = makeAddress();
  const partner = makeAddress();
  const txBlock = 42;
  const txHash = makeHash();
  const transferAmount = 42;

  function initEpicMock(action$: Observable<RaidenAction>): Observable<raidenSynced> {
    return action$.pipe(
      filter(raidenStarted.is),
      mapTo(
        raidenSynced({
          tookMs: 9,
          initialBlock: 1,
          currentBlock: 10,
        }),
      ),
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

  test('address', () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([dummyEpic]), dummyReducer);
    expect(raiden.address).toBe(dummyState.address);
  });

  test('start', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    expect(raiden.network).toEqual({ name: 'test', chainId: 1337 });
    expect(raiden.log).toEqual(expect.objectContaining({ name: `raiden:${raiden.address}` }));
    expect(raiden.started).toBeUndefined();
    await expect(raiden.start()).resolves.toBeUndefined();
    expect(raiden.started).toEqual(true);
  });

  test('stop', async () => {
    const deps = makeDummyDependencies();

    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    await expect(raiden.start()).resolves.toBeUndefined();
    expect(raiden.started).toEqual(true);
    const lastPromise = raiden.action$.toPromise();
    await expect(raiden.stop()).resolves.toBeUndefined();
    await expect(lastPromise).resolves.toEqual(raidenShutdown({ reason: ShutdownReason.STOP }));
    expect(raiden.started).toBe(false);
  });

  test('updateConfig', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics([initEpicMock]), dummyReducer);
    await expect(raiden.start()).resolves.toBeUndefined();
    const configPromise = raiden.action$.pipe(first(raidenConfigUpdate.is)).toPromise();
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
    const monitorTokenPromise = raiden.action$.pipe(first(tokenMonitored.is)).toPromise();
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
            },
            {
              address: partner,
            },
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

    const payload = raiden.action$
      .pipe(
        first(matrixPresence.success.is),
        map((e) => e.payload),
      )
      .toPromise();

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

    const payload = raiden.action$
      .pipe(
        first(udcDeposit.success.is),
        map((e) => e.payload),
      )
      .toPromise();

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

    const payload = raiden.action$
      .pipe(
        first(udcWithdrawPlan.success.is),
        map((e) => e.payload),
      )
      .toPromise();

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

    const payload = raiden.action$
      .pipe(
        first(udcWithdraw.success.is),
        map((e) => e.payload),
      )
      .toPromise();

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
    const id = 10;
    const settleTimeout = 500;
    const isFirstParticipant = true;
    const deposit: BigNumber = BigNumber.from('10000000000000000000');
    const subkey = false;
    const channelOpenHash = makeHash();
    const channelDepositHash = makeHash();
    const msgId = '123';
    const chainId = 1337;
    const updating_nonce = BigNumber.from(1) as UInt<8>;
    const other_nonce = BigNumber.from(1) as UInt<8>;
    const other_capacity = BigNumber.from(10) as UInt<32>;

    const emptyChannelEnd: ChannelEnd = {
      address: AddressZero as Address,
      deposit: Zero as UInt<32>,
      withdraw: Zero as UInt<32>,
      locks: [],
      balanceProof: BalanceProofZero,
      pendingWithdraws: [],
      nextNonce: One as UInt<8>,
    };

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
            {
              deposit: action.payload.deposit as UInt<32>,
              subkey: action.payload.subkey,
              waitOpen: true,
            },
            action.meta,
          ),
          channelOpen.success(
            {
              id,
              token,
              settleTimeout,
              isFirstParticipant,
              txHash: channelOpenHash,
              txBlock: 9,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          channelDeposit.success(
            {
              id,
              participant: address as Address,
              totalDeposit: deposit as UInt<32>,
              txHash: channelDepositHash,
              txBlock: 11,
              confirmed: true,
            },
            { tokenNetwork, partner },
          ),
          messageServiceSend.request(
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
                  channel_identifier: BigNumber.from(id) as UInt<32>,
                },
              },
            },
            { service: Service.PFS, msgId },
          ),
          messageServiceSend.success(
            { via: '!.:', tookMs: 10, retries: 1 },
            { service: Service.PFS, msgId },
          ),
        ]),
      );
    }

    const deps = makeDummyDependencies();
    deps.registryContract = {
      token_to_token_networks: jest.fn(async () => tokenNetwork),
    } as any;
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics([initEpicMock, channelOpenEpicMock]),
      channelOpenSuccessReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();

    await expect(
      raiden.openChannel(token, partner, {
        settleTimeout,
        subkey,
        deposit,
      }),
    ).resolves.toEqual(channelOpenHash);
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
});
