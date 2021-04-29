/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAddress } from '@ethersproject/address';
import { BigNumber } from '@ethersproject/bignumber';
import { hexlify } from '@ethersproject/bytes';
import type { Network } from '@ethersproject/providers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { randomBytes } from '@ethersproject/random';
import { Wallet } from '@ethersproject/wallet';
import memoize from 'lodash/memoize';
import logging from 'loglevel';
import type { MatrixClient } from 'matrix-js-sdk';
import type { Observable } from 'rxjs';
import { AsyncSubject, BehaviorSubject, of, ReplaySubject } from 'rxjs';
import { filter, first, ignoreElements, map, mapTo } from 'rxjs/operators';

import type { RaidenAction } from '@/actions';
import { raidenConfigUpdate, raidenShutdown, raidenStarted, raidenSynced } from '@/actions';
import { tokenMonitored } from '@/channels/actions';
import { makeDefaultConfig } from '@/config';
import { ShutdownReason } from '@/constants';
import {
  HumanStandardToken__factory,
  MonitoringService__factory,
  SecretRegistry__factory,
  ServiceRegistry__factory,
  TokenNetwork__factory,
  TokenNetworkRegistry__factory,
} from '@/contracts';
import { combineRaidenEpics } from '@/epics';
import { Raiden } from '@/raiden';
import { udcDeposit, udcWithdrawPlan } from '@/services/actions';
import type { RaidenState } from '@/state';
import { makeInitialState } from '@/state';
import { standardCalculator } from '@/transfers/mediate/types';
import { matrixPresence } from '@/transport/actions';
import type { ContractsInfo, Latest, RaidenEpicDeps } from '@/types';
import { pluckDistinct } from '@/utils/rx';
import type { Address, UInt } from '@/utils/types';

jest.mock('@ethersproject/providers');

// TODO: dedupe this from integrations/mocks.ts in a higher utility file
// don't import from there to avoid pulling in all the patches there
function makeAddress() {
  return getAddress(hexlify(randomBytes(20))) as Address;
}

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
  const busy$ = new BehaviorSubject(false);
  const db = { busy$, close: jest.fn() } as any;

  const defaultConfig = makeDefaultConfig({ network });
  const log = logging.getLogger(`raiden:${address}`);

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

  const token = makeAddress();
  const tokenNetwork = makeAddress();
  const partner = makeAddress();

  test('address', () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics(of(dummyEpic)), dummyReducer);
    expect(raiden.address).toBe(dummyState.address);
  });

  test('start', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics(of(initEpicMock)),
      dummyReducer,
    );
    expect(raiden.network).toEqual({ name: 'test', chainId: 1337 });
    expect(raiden.log).toEqual(expect.objectContaining({ name: `raiden:${raiden.address}` }));
    expect(raiden.started).toBeUndefined();
    await expect(raiden.start()).resolves.toBeUndefined();
    expect(raiden.started).toEqual(true);
  });

  test('stop', async () => {
    const deps = makeDummyDependencies();

    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics(of(initEpicMock)),
      dummyReducer,
    );
    await expect(raiden.start()).resolves.toBeUndefined();
    expect(raiden.started).toEqual(true);
    const lastPromise = raiden.action$.toPromise();
    await expect(raiden.stop()).resolves.toBeUndefined();
    await expect(lastPromise).resolves.toEqual(raidenShutdown({ reason: ShutdownReason.STOP }));
    expect(raiden.started).toBe(false);
  });

  test('updateConfig', async () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics(of(initEpicMock)),
      dummyReducer,
    );
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
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics(of(initEpicMock)),
      dummyReducer,
    );
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
      combineRaidenEpics(of(initEpicMock, matrixPresenceEpicMock)),
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
      combineRaidenEpics(of(initEpicMock, UDCDepositEpicMock)),
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
      combineRaidenEpics(of(initEpicMock, UDCDepositEpicMock)),
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
      combineRaidenEpics(of(initEpicMock, udcDepositEpicMock)),
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
    const raiden = new Raiden(
      dummyState,
      deps,
      combineRaidenEpics(of(initEpicMock)),
      dummyReducer,
    );
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
      combineRaidenEpics(of(initEpicMock, udcWithdrawEpicMock)),
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
});
