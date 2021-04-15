/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAddress } from '@ethersproject/address';
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
import { ignoreElements } from 'rxjs/operators';

import type { RaidenAction } from '@/actions';
import { makeDefaultConfig } from '@/config';
import {
  HumanStandardToken__factory,
  MonitoringService__factory,
  SecretRegistry__factory,
  ServiceRegistry__factory,
  TokenNetwork__factory,
  TokenNetworkRegistry__factory,
  UserDeposit__factory,
} from '@/contracts';
import { combineRaidenEpics } from '@/epics';
import { Raiden } from '@/raiden';
import type { RaidenState } from '@/state';
import { makeInitialState } from '@/state';
import { standardCalculator } from '@/transfers/mediate/types';
import type { ContractsInfo, Latest, RaidenEpicDeps } from '@/types';
import { pluckDistinct } from '@/utils/rx';
import type { Address } from '@/utils/types';

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
  const db = { busy$ } as any;

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
    userDepositContract: UserDeposit__factory.connect(contractsInfo.UserDeposit.address, signer),
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
  test('address', () => {
    const deps = makeDummyDependencies();
    const raiden = new Raiden(dummyState, deps, combineRaidenEpics(of(dummyEpic)), dummyReducer);
    expect(raiden.address).toBe(dummyState.address);
  });
});
