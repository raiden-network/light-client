/* eslint-disable @typescript-eslint/no-explicit-any */
import { MockMatrixRequestFn } from './mocks';

import { BigNumber } from '@ethersproject/bignumber';
import { Zero } from '@ethersproject/constants';
import { keccak256 } from '@ethersproject/keccak256';
import type { Network } from '@ethersproject/networks';
import { parseEther, parseUnits } from '@ethersproject/units';
import ganache from 'ganache-cli';
import logging from 'loglevel';
import { request } from 'matrix-js-sdk';
import { timer } from 'rxjs';
import { filter, finalize, first, take, takeUntil, toArray } from 'rxjs/operators';

import { ConfirmableAction, raidenShutdown, raidenStarted } from '@/actions';
import { newBlock, tokenMonitored } from '@/channels/actions';
import { ChannelState } from '@/channels/state';
import { channelKey } from '@/channels/utils';
import type { PartialRaidenConfig } from '@/config';
import { ShutdownReason } from '@/constants';
import { ServiceRegistry__factory } from '@/contracts';
import type { RaidenDatabaseMeta } from '@/db/types';
import { Raiden as OrigRaiden } from '@/raiden';
import { udcWithdrawn } from '@/services/actions';
import type { RaidenState } from '@/state';
import type { RaidenTransfer } from '@/transfers/state';
import { RaidenTransferStatus } from '@/transfers/state';
import { getSecrethash, makeSecret } from '@/transfers/utils';
import { matrixSetup } from '@/transport/actions';
import type { ContractsInfo } from '@/types';
import { isActionOf } from '@/utils/actions';
import { jsonStringify } from '@/utils/data';
import { ErrorCodes } from '@/utils/error';
import type { Address, Int, Secret, UInt } from '@/utils/types';

import { TestProvider } from './provider';

logging.setDefaultLevel(logging.levels.DEBUG);

// mock waitConfirmation Raiden helper to also trigger provider.mine
jest.mock('@/helpers', () => {
  const actual = jest.requireActual<any>('@/helpers');
  return {
    ...actual,
    waitConfirmation: jest.fn(
      (receipt, deps) => (
        (deps.provider as TestProvider).mine(3), actual.waitConfirmation(receipt, deps)
      ),
    ),
  };
});

type Raiden = OrigRaiden;
const Raiden = OrigRaiden as typeof OrigRaiden & {
  create: jest.Mock<Promise<Raiden>, Parameters<typeof OrigRaiden['create']>>;
};
const confirmationBlocks = 2;

function makeServer(chainId: number) {
  return ganache.provider({
    total_accounts: 5,
    default_balance_ether: 5,
    seed: 'testrpc_provider',
    network_id: chainId,
    _chainId: chainId,
    _chainIdRpc: chainId,
    // logger: console,
  });
}

describe('Raiden', () => {
  const server = makeServer(1338);
  let provider = new TestProvider(server);
  let accounts: string[],
    contractsInfo: ContractsInfo,
    snapId: number | undefined,
    raiden: Raiden,
    token: string,
    tokenNetwork: string,
    partner: string,
    network: Network,
    pfsInfoResponse: any,
    pfsAddress: string,
    pfsUrl: string;
  const config: PartialRaidenConfig = {
    settleTimeout: 20,
    revealTimeout: 5,
    confirmationBlocks,
    pollingInterval: 10,
    httpTimeout: 5000,
  };

  let httpBackend: MockMatrixRequestFn;
  const matrixServer = 'matrix.raiden.test';

  const raidens: Raiden[] = [];
  const origCreate = OrigRaiden.create;
  jest.spyOn(Raiden, 'create').mockImplementation(async function (...args) {
    const raiden = (await origCreate.call(Raiden, ...args)) as Raiden;
    raiden.action$
      .pipe(
        finalize(() => {
          const idx = raidens.indexOf(raiden);
          if (idx >= 0) raidens.splice(idx, 1);
        }),
        filter(raidenStarted.is),
      )
      .subscribe(() => raidens.push(raiden));
    raiden.action$
      .pipe(
        filter(ConfirmableAction.is),
        filter((a) => a.payload.confirmed === undefined),
      )
      .subscribe((a) =>
        provider.mineUntil(a.payload.txBlock + raiden.config.confirmationBlocks + 1),
      );
    Object.assign(raiden, { _test: expect.getState().currentTestName });
    return raiden;
  });

  function getStorageOpts() {
    // prefix is needed in order to isolate state storage per test
    return { adapter: 'memory', prefix: expect.getState().currentTestName + '/' };
  }

  async function createRaiden(
    account: number | string,
    storage?: { state?: any; adapter?: any; prefix?: string },
    subkey?: true,
  ): Promise<Raiden> {
    return await Raiden.create(
      // we need to create a new test provider, to avoid sharing provider instances,
      // but with same underlying ganache instance
      new TestProvider(server),
      account,
      { ...getStorageOpts(), ...storage },
      contractsInfo,
      config,
      subkey,
    );
  }

  const fetch = jest.fn();
  Object.assign(globalThis, { fetch });

  beforeAll(async () => {
    jest.setTimeout(60e3);

    contractsInfo = await provider.deployRegistry();
    ({ token, tokenNetwork } = await provider.deployTokenNetwork(contractsInfo));
    accounts = await provider.listAccounts();
    partner = accounts[1];
    network = await provider.getNetwork();

    const serviceRegistryContract = ServiceRegistry__factory.connect(
        contractsInfo.ServiceRegistry.address,
        provider,
      ),
      events = await provider.getLogs({
        ...serviceRegistryContract.filters.RegisteredService(null, null, null, null),
        fromBlock: 0,
        toBlock: 'latest',
      }),
      parsed = serviceRegistryContract.interface.parseLog(events[0]);
    pfsAddress = parsed.args[0] as string;
    pfsUrl = await serviceRegistryContract.urls(pfsAddress);

    pfsInfoResponse = {
      message: 'pfs message',
      network_info: {
        chain_id: network.chainId,
        token_network_registry_address: contractsInfo.TokenNetworkRegistry.address,
      },
      operator: 'pfs operator',
      payment_address: pfsAddress,
      price_info: 2,
      version: '0.4.1',
    };
  });

  beforeEach(async () => {
    if (snapId !== undefined) await provider.revert(snapId);
    provider = new TestProvider(provider.provider);
    snapId = await provider.snapshot();
    await provider.getBlockNumber();

    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn<Promise<unknown>, []>(async () => ({
        active_servers: [matrixServer],
        all_servers: [],
      })),
      text: jest.fn(async () => ``),
    });

    // setup matrix mock http backend
    httpBackend = new MockMatrixRequestFn(matrixServer);
    request(httpBackend.requestFn.bind(httpBackend));

    raiden = await createRaiden(0);
    await raiden.start();
  });

  afterEach(async () => {
    while (raidens.length) {
      await Promise.all(raidens.map((r) => r.stop()));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    httpBackend.stop();
    fetch.mockRestore();
  });

  test('create from other params and RaidenState', async () => {
    expect.assertions(15);

    await raiden.stop();
    const raiden0State = await raiden.dumpDatabase();
    const raiden0StateMeta = raiden0State[0] as RaidenDatabaseMeta;

    // state & storage object
    await expect(
      Raiden.create(
        provider,
        0,
        {
          state: [
            { ...raiden0StateMeta, blockNumber: raiden0StateMeta.blockNumber - 2 },
            ...raiden0State.slice(1),
          ],
          ...getStorageOpts(),
        },
        contractsInfo,
        config,
      ),
    ).rejects.toThrow(ErrorCodes.RDN_STATE_MIGRATION);

    await expect(
      Raiden.create(
        provider,
        0,
        {
          state: [
            { ...raiden0StateMeta, blockNumber: raiden0StateMeta.blockNumber + 2 },
            ...raiden0State.slice(1),
          ],
          ...getStorageOpts(),
        },
        contractsInfo,
        config,
      ),
    ).resolves.toBeInstanceOf(Raiden);

    await expect(
      Raiden.create(provider, 0, getStorageOpts(), contractsInfo, config),
    ).resolves.toBeInstanceOf(Raiden);

    // token address not found as an account in provider
    await expect(
      Raiden.create(provider, token, getStorageOpts(), contractsInfo, config),
    ).rejects.toThrow(ErrorCodes.RDN_ACCOUNT_NOT_FOUND);

    // neither account index, address nor private key
    await expect(
      Raiden.create(provider, '0x1234', getStorageOpts(), contractsInfo, config),
    ).rejects.toThrow(ErrorCodes.RDN_STRING_ACCOUNT_INVALID);

    // from hex-encoded private key, initial unknown state (decodable) but invalid address inside
    await expect(
      Raiden.create(
        provider,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        {
          state: [{ ...raiden0StateMeta, address: token as Address }, ...raiden0State.slice(1)],
          ...getStorageOpts(),
        },
        contractsInfo,
      ),
    ).rejects.toThrow(ErrorCodes.RDN_STATE_ADDRESS_MISMATCH);

    await expect(
      Raiden.create(
        provider,
        1,
        {
          state: [
            { ...raiden0StateMeta, registry: token as Address, address: accounts[1] as Address },
            ...raiden0State.slice(1),
          ],
          ...getStorageOpts(),
        },
        contractsInfo,
      ),
    ).rejects.toThrow(ErrorCodes.RDN_STATE_NETWORK_MISMATCH);

    const raiden1State = [
      { ...raiden0StateMeta, address: accounts[1] as Address },
      { _id: 'state.address', value: accounts[1] },
      ...raiden0State.slice(1).filter(({ _id }) => _id !== 'state.address'),
    ];
    // success when using address of account on provider and initial state,
    // and pass UserDeposit address to fetch contracts info from
    provider.pollingInterval = config.pollingInterval! * 3;
    const raiden1 = await Raiden.create(
      provider,
      accounts[1],
      {
        state: raiden1State,
        ...getStorageOpts(),
      },
      contractsInfo.UserDeposit.address,
      config,
    );
    expect(raiden1).toBeInstanceOf(Raiden);
    expect(raiden1.contractsInfo).toMatchObject({
      TokenNetworkRegistry: {
        address: contractsInfo.TokenNetworkRegistry.address,
        block_number: expect.any(Number),
      },
      ServiceRegistry: {
        address: contractsInfo.ServiceRegistry.address,
        block_number: expect.any(Number),
      },
      UserDeposit: {
        address: contractsInfo.UserDeposit.address,
        block_number: expect.any(Number),
      },
      SecretRegistry: {
        address: contractsInfo.SecretRegistry.address,
        block_number: expect.any(Number),
      },
      MonitoringService: {
        address: contractsInfo.MonitoringService.address,
        block_number: expect.any(Number),
      },
      OneToN: {
        address: contractsInfo.OneToN.address,
        block_number: expect.any(Number),
      },
    });

    logging.warn('Starting raiden1', raiden1.address);
    // test Raiden.started, not yet started
    expect(raiden1.started).toBeUndefined();
    raiden1.start();
    expect(raiden1.started).toBe(true);
    expect(provider.pollingInterval).toBe(config.pollingInterval);
    await raiden1.stop();
    expect(raiden1.started).toBe(false);

    // success when creating using subkey
    const raiden2 = await Raiden.create(
      provider,
      0,
      getStorageOpts(),
      contractsInfo,
      config,
      true,
    );
    expect(raiden2).toBeInstanceOf(Raiden);
    expect(raiden2.mainAddress).toBe(accounts[0]);
  });

  test('address', () => {
    expect(raiden.address).toBe(accounts[0]);
  });

  test('network', async () => {
    expect.assertions(1);
    expect(raiden.network).toEqual(await provider.getNetwork());
  });

  test('contractVersion', async () => {
    expect.assertions(1);
    expect(Raiden.contractVersion).toMatch(/.+/);
  });

  test('contractsInfo', async () => {
    expect.assertions(1);
    expect(raiden.contractsInfo).toMatchObject({
      TokenNetworkRegistry: {
        address: expect.stringMatching(/0x[0-9a-f]{40}/i),
        block_number: expect.any(Number),
      },
    });
  });

  test('getBlockNumber', async () => {
    expect.assertions(1);
    await expect(raiden.getBlockNumber()).resolves.toBeGreaterThanOrEqual(
      contractsInfo.TokenNetworkRegistry.block_number,
    );
  });

  test('config', async () => {
    expect.assertions(3);
    expect(raiden.config).toMatchObject({
      discoveryRoom: 'raiden_1338_discovery',
      settleTimeout: 20,
      revealTimeout: 5,
    });
    expect(raiden.config.pfs).toBe('');
    raiden.updateConfig({ revealTimeout: 8 });
    expect(raiden.config).toMatchObject({
      revealTimeout: 8,
    });
  });

  test('getBalance', async () => {
    expect.assertions(1);
    await expect(raiden.getBalance()).resolves.toEqual(parseEther('5'));
  });

  test('getTokenBalance', async () => {
    expect.assertions(1);
    await expect(raiden.getTokenBalance(token)).resolves.toEqual(parseUnits('1000', 18));
  });

  test('getTokenInfo', async () => {
    expect.assertions(1);
    await expect(raiden.getTokenInfo(token)).resolves.toEqual({
      totalSupply: expect.any(BigNumber),
      decimals: 18,
      name: 'TestToken1',
      symbol: 'TK1',
    });
  });

  test('getTokenList', async () => {
    expect.assertions(1);
    await expect(raiden.getTokenList()).resolves.toEqual([token]);
  });

  describe('getUDCCapacity', () => {
    test('no balance', async () => {
      expect.assertions(2);
      // initial high, to avoid it interferring with caps[Capabilities.RECEIVE]
      await expect(raiden.userDepositTokenAddress()).resolves.toMatch(/^0x/);
      // should be updated soonish
      await expect(raiden.getUDCCapacity()).resolves.toEqual(Zero);
    });

    test('mint and deposit', async () => {
      expect.assertions(1);

      await raiden.mint(await raiden.userDepositTokenAddress(), 10);
      await raiden.depositToUDC(10);
      await expect(raiden.getUDCCapacity()).resolves.toEqual(BigNumber.from(10));
    });
  });

  test('monitorToken', async () => {
    expect.assertions(2);
    await expect(raiden.monitorToken(token)).resolves.toBe(tokenNetwork);
    await expect(raiden.monitorToken(tokenNetwork)).rejects.toThrow('Unknown');
  });

  describe('openChannel', () => {
    test('tx fail', async () => {
      expect.assertions(1);
      // settleTimeout < min
      await expect(
        raiden.openChannel(token, partner, { settleTimeout: config.settleTimeout! - 1 }),
      ).rejects.toThrow();
    });

    test('success with default settleTimeout=20 & deposit', async () => {
      expect.assertions(2);
      await expect(raiden.openChannel(token, partner, { deposit: 117 })).resolves.toMatch(/^0x/);
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toMatchObject({
        [token]: {
          [partner]: {
            token,
            tokenNetwork,
            partner,
            state: ChannelState.open,
            ownDeposit: BigNumber.from(117),
            partnerDeposit: Zero,
            settleTimeout: 20,
            balance: Zero,
          },
        },
      });
    });
  });

  describe('depositChannel', () => {
    beforeEach(async () => {
      await raiden.openChannel(token, partner);
    });

    test('unknown token network', async () => {
      expect.assertions(1);
      // token=partner
      await expect(
        raiden.depositChannel(partner, partner, parseUnits('100', 18)),
      ).rejects.toThrow();
    });

    test('tx fail', async () => {
      expect.assertions(1);
      // deposit bigger than balance (1k tokens)
      await expect(
        raiden.depositChannel(token, partner, parseUnits('2000', 18)),
      ).rejects.toThrow();
    });

    test('success', async () => {
      expect.assertions(3);
      await expect(raiden.depositChannel(token, partner, 100)).resolves.toMatch(/^0x/);
      await expect(raiden.depositChannel(token, partner, 200)).resolves.toMatch(/^0x/);
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toMatchObject({
        [token]: {
          [partner]: {
            token,
            tokenNetwork,
            partner,
            state: ChannelState.open,
            ownDeposit: BigNumber.from(300),
            balance: Zero,
            capacity: BigNumber.from(300),
          },
        },
      });
    });
  });

  describe('raiden can fetch past events', () => {
    let raiden1: Raiden;

    beforeEach(async () => {
      await raiden.openChannel(token, partner);
      await raiden.depositChannel(token, partner, 200);
      raiden1 = await createRaiden(partner);
      raiden1.start();
    });

    test('partner instance fetches events fired before instantiation', async () => {
      await expect(
        raiden1.channels$
          .pipe(
            filter((channels) => channels[token]?.[raiden.address]?.state === ChannelState.open),
            filter((channels) => channels[token]?.[raiden.address]?.partnerDeposit?.gt?.(0)),
            first(),
          )
          .toPromise(), // resolves on first emitted value which passes all filters above
      ).resolves.toMatchObject({
        [token]: {
          [raiden.address]: {
            state: ChannelState.open,
            ownDeposit: Zero,
            partnerDeposit: BigNumber.from(200),
          },
        },
      });
    });

    test('raiden instance fetches new events which happened while it was offline', async () => {
      expect.assertions(7);

      // wait for raiden1 to pick up main tokenNetwork channel
      await expect(
        raiden1.channels$
          .pipe(first((channels) => !!channels[token]?.[raiden.address]))
          .toPromise(),
      ).resolves.toMatchObject({
        [token]: { [raiden.address]: { state: ChannelState.open } },
      });

      let raidenState: RaidenState | undefined;
      raiden.state$.subscribe((state) => (raidenState = state));
      raiden.stop();
      expect(raidenState!.tokens).toEqual({ [token]: tokenNetwork });
      // expect & save block when raiden was stopped
      expect(raidenState).toMatchObject({ blockNumber: expect.any(Number) });

      // edge case 1: ChannelClosed event happens right after raiden is stopped
      const closeBlock = (
        await provider.getTransactionReceipt(await raiden1.closeChannel(token, raiden.address))
      ).blockNumber!;
      await provider.mine();

      // deploy new token network while raiden is offline (raiden1/partner isn't)
      const { token: newToken, tokenNetwork: newTokenNetwork } = await provider.deployTokenNetwork(
        contractsInfo,
      );
      await provider.mine();

      // open a new channel from partner to main instance on the new tokenNetwork
      // edge case 2: ChannelOpened at exact block when raiden is restarted
      const restartBlock = (
        await provider.getTransactionReceipt(await raiden1.openChannel(newToken, raiden.address))
      ).blockNumber!;

      raidenState = undefined;
      raiden = await createRaiden(0);
      raiden.state$.subscribe((state) => (raidenState = state));
      raiden.start();

      await provider.mine(5);

      // ensure after hot boot, state is rehydrated and contains (only) previous token
      expect(raidenState).toBeDefined();
      expect(raidenState!.tokens).toEqual({ [token]: tokenNetwork });

      // newToken isn't of interest, needs to be explicitly monitored
      raiden.monitorToken(newToken);

      // wait token & channel on it to be fetched, even if it happened while we were offline
      await expect(
        raiden.channels$.pipe(first((channels) => !!channels[newToken]?.[partner])).toPromise(),
      ).resolves.toMatchObject({
        // test edge case 1: channel closed at stop block is picked up correctly
        [token]: {
          [partner]: {
            state: expect.toBeOneOf([ChannelState.closed, ChannelState.settleable]),
            closeBlock,
          },
        },
        // test edge case 2: channel opened at restart block is picked up correctly
        [newToken]: { [partner]: { state: ChannelState.open, openBlock: restartBlock } },
      });
      // test sync state$ subscribe
      expect(
        raidenState!.channels[
          channelKey({ tokenNetwork: newTokenNetwork as Address, partner: partner as Address })
        ],
      ).toBeDefined();
    });
  });

  describe('closeChannel', () => {
    beforeEach(async () => {
      await raiden.openChannel(token, partner);
      await raiden.depositChannel(token, partner, 200);
    });

    test('unknown token network', async () => {
      expect.assertions(1);
      // token=partner
      await expect(raiden.closeChannel(partner, partner)).rejects.toThrow();
    });

    test('no channel with address', async () => {
      expect.assertions(1);
      // there's no channel with partner=token
      await expect(raiden.closeChannel(token, token)).rejects.toThrow();
    });

    test('success', async () => {
      expect.assertions(2);
      await expect(raiden.closeChannel(token, partner)).resolves.toMatch(/^0x/);
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toMatchObject({
        [token]: {
          [partner]: {
            token,
            tokenNetwork,
            partner,
            state: ChannelState.closed,
            closeBlock: expect.any(Number),
          },
        },
      });
    });
  });

  describe('settleChannel', () => {
    beforeEach(async () => {
      await raiden.openChannel(token, partner);
      await provider.mine();
      await raiden.closeChannel(token, partner);
    });

    test('unknown token network', async () => {
      expect.assertions(1);
      // token=partner
      await expect(raiden.settleChannel(partner, partner)).rejects.toThrow();
    });

    test('no channel with address', async () => {
      expect.assertions(1);
      // there's no channel with partner=token
      await expect(raiden.settleChannel(token, token)).rejects.toThrow();
    });

    test('channel not settleable yet', async () => {
      expect.assertions(1);
      // there's no channel with partner=token
      await expect(raiden.settleChannel(token, partner)).rejects.toThrow();
    });

    test('success', async () => {
      expect.assertions(3);
      await provider.mine(config.settleTimeout! + 1);
      await expect(
        raiden.channels$
          .pipe(first((c) => c[token]?.[partner]?.state === ChannelState.settleable))
          .toPromise(),
      ).resolves.toMatchObject({
        [token]: {
          [partner]: {
            token,
            tokenNetwork,
            partner,
            state: ChannelState.settleable,
            closeBlock: expect.any(Number),
          },
        },
      });
      await expect(raiden.settleChannel(token, partner)).resolves.toMatch(/^0x/);
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toEqual({});
    }, 90e3);
  });

  describe('events$', () => {
    test('stop shutdown', async () => {
      const promise = raiden.events$.toPromise();
      raiden.stop();
      await expect(promise).resolves.toMatchObject({
        type: raidenShutdown.type,
        payload: { reason: ShutdownReason.STOP },
      });
    });

    test('newBlock', async () => {
      expect.assertions(1);
      const promise = raiden.events$.pipe(first(newBlock.is)).toPromise();
      provider.mine(10);
      await expect(promise).resolves.toEqual(newBlock({ blockNumber: expect.any(Number) }));
    });

    test('tokenMonitored', async () => {
      expect.assertions(4);

      const promise = raiden.events$
        .pipe(
          filter(tokenMonitored.is),
          first((action) => action.payload.token === token),
        )
        .toPromise();

      // deploy a new token & tokenNetwork
      const { token, tokenNetwork } = await provider.deployTokenNetwork(contractsInfo);

      // despite deployed, new token network isn't picked as it isn't of interest
      await expect(
        raiden.state$
          .pipe(
            filter((state) => !!state.tokens?.[token]),
            takeUntil(timer(10)),
          )
          .toPromise(),
      ).resolves.toBeUndefined();

      // promise should only resolve after we explicitly monitor this token
      await expect(raiden.monitorToken(token)).resolves.toBe(tokenNetwork);

      await expect(promise).resolves.toEqual(
        tokenMonitored(
          expect.objectContaining({
            fromBlock: expect.any(Number),
            token: token as Address,
            tokenNetwork: tokenNetwork as Address,
          }),
        ),
      );

      // while partner is not yet initialized, open a channel with them
      await raiden.openChannel(token, partner);

      const raiden1 = await createRaiden(partner);

      const promise1 = raiden1.events$
        .pipe(
          filter(tokenMonitored.is),
          first((action) => action.payload.token === token),
        )
        .toPromise();

      raiden1.start();

      // promise1, contrary to promise, should resolve at initialization, upon first scan
      // detects tokenNetwork as being of interest for having a channel with parner
      await expect(promise1).resolves.toEqual(
        tokenMonitored(
          expect.objectContaining({
            fromBlock: expect.any(Number),
            token: token as Address,
            tokenNetwork: tokenNetwork as Address,
          }),
        ),
      );
    });
  });

  describe('matrix', () => {
    test('getAvailability', async () => {
      expect.assertions(3);

      await expect(raiden.getAvailability(partner)).rejects.toThrow(ErrorCodes.TRNS_NO_VALID_USER);

      const raiden1 = await createRaiden(accounts[2]);
      expect(raiden1).toBeInstanceOf(Raiden);
      await raiden1.start();

      await expect(raiden.getAvailability(accounts[2])).resolves.toMatchObject({
        userId: `@${accounts[2].toLowerCase()}:${matrixServer}`,
        available: true,
        ts: expect.any(Number),
      });
    });
  });

  describe('transfer', () => {
    beforeEach(async () => {
      await raiden.openChannel(token, partner);
      await raiden.depositChannel(token, partner, 200);
    });

    test('invalid target', async () => {
      expect.assertions(1);
      await expect(raiden.transfer(token, '0xnotAnAddress', 23)).rejects.toThrowError(
        /Invalid.*address\b/i,
      );
    });

    test('unknown token network', async () => {
      expect.assertions(1);
      await expect(raiden.transfer(partner, partner, 23)).rejects.toThrowError(/Unknown token/i);
    });

    test('invalid amount', async () => {
      expect.assertions(1);
      await expect(raiden.transfer(token, partner, -1)).rejects.toThrowError(
        /Invalid amount parameter./i,
      );
    });

    test("secret and secrethash doesn't match", async () => {
      expect.assertions(1);
      const secret = makeSecret(),
        secrethash = getSecrethash(keccak256('0xdeadbeef') as Secret);
      await expect(
        raiden.transfer(token, partner, 23, { secret, secrethash }),
      ).rejects.toThrowError(/secrethash.*hash.*secret/i);
    });

    test('invalid provided secret', async () => {
      expect.assertions(1);
      await expect(
        raiden.transfer(token, partner, 23, { secret: 'not a valid secret' }),
      ).rejects.toThrowError(/Invalid.*secret\b/i);
    });

    test('invalid provided secrethash', async () => {
      expect.assertions(1);
      await expect(
        raiden.transfer(token, partner, 23, { secrethash: '0xdeadbeef' }),
      ).rejects.toThrowError(/Invalid.*secrethash\b/i);
    });

    test('invalid provided paymentId', async () => {
      expect.assertions(1);
      await expect(raiden.transfer(token, partner, 23, { paymentId: -1 })).rejects.toThrowError(
        /Invalid payment identifier parameter./i,
      );
    });

    test('invalid provided metadata/route', async () => {
      expect.assertions(1);
      await expect(
        raiden.transfer(token, partner, 23, {
          paths: [{ path: ['0xnotAnAddress' as Address], fee: Zero as Int<32> }],
        }),
      ).rejects.toThrowError(/Invalid path parameter./i);
    });

    describe('partner online', () => {
      // partner's client instance
      let raiden1: Raiden;

      beforeEach(async () => {
        raiden1 = await createRaiden(partner);
        await raiden1.start();

        await expect(raiden.getAvailability(partner)).resolves.toMatchObject({
          userId: `@${partner.toLowerCase()}:${matrixServer}`,
          available: true,
          ts: expect.any(Number),
        });
      });

      test('fail: direct channel without enough capacity, pfs disabled', async () => {
        expect.assertions(3);
        raiden.updateConfig({ pfs: null });

        // there's some channel with enough capacity, but not the one returned by PFS
        const partner3 = accounts[3];
        await raiden.openChannel(token, partner3, { deposit: 300 });
        const raiden3 = await createRaiden(partner3);
        await raiden3.start();
        await expect(raiden.getAvailability(partner3)).resolves.toBeDefined();

        await expect(raiden.transfer(token, partner, 201)).rejects.toThrowError(
          ErrorCodes.PFS_DISABLED,
        );
      });

      test('success: direct route', async () => {
        expect.assertions(4);

        const transfers: { [k: string]: RaidenTransfer } = {};
        raiden.transfers$.subscribe((t) => (transfers[t.key] = t));

        const key = await raiden.transfer(token, partner, 23);
        expect(key).toMatch(/^sent:0x[0-9a-fA-F]{64}$/);

        expect(key in transfers).toBe(true);
        expect(transfers[key].status).toBe(RaidenTransferStatus.pending);
      });

      test('fail: invalid lockTimeout', async () => {
        expect.assertions(2);

        await expect(raiden.transfer(token, partner, 23, { lockTimeout: 1 })).rejects.toThrowError(
          'expiration',
        );
      });

      test('success: auto pfs route', async () => {
        expect.assertions(7);

        const target = accounts[2],
          raiden2 = await createRaiden(target);

        await raiden2.start();

        await expect(raiden.getAvailability(target)).resolves.toMatchObject({
          userId: `@${target.toLowerCase()}:${matrixServer}`,
          available: true,
          ts: expect.any(Number),
        });
        await new Promise((resolve) => setTimeout(resolve, 100));

        // auto pfs mode
        raiden.updateConfig({ pfs: '' });

        fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn(async () => pfsInfoResponse),
          text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
        });

        fetch.mockResolvedValueOnce({
          ok: true,
          status: 404,
          json: jest.fn(async () => {
            /* error */
          }),
          text: jest.fn(async () => jsonStringify({})),
        });

        const result = {
          result: [
            // first returned route is invalid and should be filtered
            { path: [tokenNetwork, target], estimated_fee: 0 },
            { path: [partner, target], estimated_fee: 0 },
          ],
          feedback_token: '0xfeedback',
        };
        fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn(async () => result),
          text: jest.fn(async () => jsonStringify(result)),
        });

        const transfers: { [k: string]: RaidenTransfer } = {};
        raiden.transfers$.subscribe((t) => (transfers[t.key] = t));

        const key = await raiden.transfer(token, target, 23);
        expect(key).toMatch(/^sent:0x[0-9a-fA-F]{64}$/);

        expect(key in transfers).toBe(true);
        expect(transfers[key].status).toBe(RaidenTransferStatus.pending);

        // transfer metadata contains the actual used routes (removing invalid ones)
        expect(transfers[key].metadata).toEqual({
          routes: [{ route: [partner, target] }],
        });

        expect(fetch).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`^${pfsUrl}/.*/${tokenNetwork}/paths$`)),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });
  });

  describe('findPFS', () => {
    test('fail config.pfs disabled', async () => {
      expect.assertions(1);

      raiden.updateConfig({ pfs: null }); // disabled pfs
      await expect(raiden.findPFS()).rejects.toThrowError('disabled');
    });

    test('success: config.pfs set', async () => {
      expect.assertions(1);

      // pfsInfo
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
      });

      raiden.updateConfig({ pfs: pfsUrl }); // pfs set
      await expect(raiden.findPFS()).resolves.toEqual([
        {
          address: pfsAddress,
          url: pfsUrl,
          rtt: expect.any(Number),
          price: expect.any(BigNumber),
          token: expect.any(String),
        },
      ]);
    });

    test('success: auto', async () => {
      expect.assertions(1);

      // pfsInfo
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
      });

      raiden.updateConfig({ pfs: '' });
      await expect(raiden.findPFS()).resolves.toEqual([
        {
          address: pfsAddress,
          url: pfsUrl,
          rtt: expect.any(Number),
          price: expect.any(BigNumber),
          token: expect.any(String),
        },
      ]);
    });
  });

  describe('findRoutes', () => {
    let raiden1: Raiden, raiden2: Raiden, target: string;

    beforeEach(async () => {
      target = accounts[2];

      await raiden.openChannel(token, partner);
      await raiden.depositChannel(token, partner, 200);

      raiden1 = await createRaiden(partner);
      raiden2 = await createRaiden(target);
      await Promise.all([raiden1.start(), raiden2.start()]);

      await expect(raiden.getAvailability(partner)).resolves.toMatchObject({
        userId: `@${partner.toLowerCase()}:${matrixServer}`,
        available: true,
        ts: expect.any(Number),
      });
      await expect(raiden.getAvailability(target)).resolves.toMatchObject({
        userId: `@${target.toLowerCase()}:${matrixServer}`,
        available: true,
        ts: expect.any(Number),
      });
      await new Promise((resolve) => setTimeout(resolve, 100));

      raiden.updateConfig({ pfs: pfsUrl });
    });

    test('success with config.pfs', async () => {
      expect.assertions(4);

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 404,
        json: jest.fn(async () => {
          /* error */
        }),
        text: jest.fn(async () => jsonStringify({})),
      });

      const result = {
        result: [
          // first returned route is invalid and should be filtered
          { path: [tokenNetwork, target], estimated_fee: 0 },
          { path: [raiden.address, partner, target], estimated_fee: 0 },
        ],
        feedback_token: '0xfeedback',
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => result),
        text: jest.fn(async () => jsonStringify(result)),
      });

      await expect(raiden.findRoutes(token, target, 23)).resolves.toEqual([
        { path: [partner, target], fee: BigNumber.from(0) },
      ]);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${pfsUrl}/.*/${tokenNetwork}/paths$`)),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    test('success with findPFS', async () => {
      expect.assertions(7);

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
      });

      // config.pfs in auto mode
      raiden.updateConfig({ pfs: '' });

      const pfss = await raiden.findPFS();
      expect(pfss).toEqual([
        {
          address: pfsAddress,
          url: pfsUrl,
          rtt: expect.any(Number),
          price: expect.any(BigNumber),
          token: expect.any(String),
        },
      ]);

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 404,
        json: jest.fn(async () => {
          /* error */
        }),
        text: jest.fn(async () => jsonStringify({})),
      });

      const result = {
        result: [
          // first returned route is invalid and should be filtered
          { path: [tokenNetwork, target], estimated_fee: 0 },
          { path: [raiden.address, partner, target], estimated_fee: 0 },
        ],
        feedback_token: '0xfeedback',
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => result),
        text: jest.fn(async () => jsonStringify(result)),
      });

      await expect(raiden.findRoutes(token, target, 23, { pfs: pfss[0] })).resolves.toEqual([
        { path: [partner, target], fee: BigNumber.from(0) },
      ]);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${pfsUrl}/.*/info`)),
        expect.anything(),
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${pfsUrl}/.*/iou`)),
        expect.anything(),
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${pfsUrl}/.*/${tokenNetwork}/paths$`)),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    test('fail: filtered no capacity routes', async () => {
      expect.assertions(4);

      // there's some channel with enough capacity, but not the one returned by PFS
      const partner3 = accounts[3];
      await raiden.openChannel(token, partner3, { deposit: 300 });
      const raiden3 = await createRaiden(partner3);
      await raiden3.start();
      await expect(raiden.getAvailability(partner3)).resolves.toBeDefined();

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 404,
        json: jest.fn(async () => {
          /* error */
        }),
        text: jest.fn(async () => jsonStringify({})),
      });

      const result = {
        result: [
          // first returned route is invalid and should be filtered
          { path: [tokenNetwork, target], estimated_fee: 0 },
          { path: [raiden.address, partner, target], estimated_fee: 0 },
        ],
        feedback_token: '0xfeedback',
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => result),
        text: jest.fn(async () => jsonStringify(result)),
      });

      await expect(raiden.findRoutes(token, target, 201)).rejects.toThrowError(
        ErrorCodes.PFS_NO_ROUTES_FOUND,
      );
    });

    test('directRoute', async () => {
      expect.assertions(5);

      await expect(raiden.directRoute(token, target, 23)).resolves.toBeUndefined();

      await expect(raiden.directRoute(token, partner, 201)).resolves.toBeUndefined();

      await expect(raiden.directRoute(token, partner, 23)).resolves.toEqual([
        { path: [partner], fee: BigNumber.from(0) },
      ]);
    });
  });

  describe('mint', () => {
    test('should throw exception if invalid address', async () => {
      expect.assertions(1);
      await expect(raiden.mint('0xTokenNetwork', 50)).rejects.toThrowError('Invalid address');
    });

    test('should throw exception on main net', async () => {
      expect.assertions(3);

      const provider = new TestProvider(makeServer(1));
      await expect(provider.getNetwork()).resolves.toMatchObject({ chainId: 1 });

      const raiden = await Raiden.create(provider, 0, getStorageOpts(), contractsInfo, config);
      expect(raiden.network).toMatchObject({ chainId: 1 });

      await expect(
        raiden.mint('0x3a989D97388a39A0B5796306C615d10B7416bE77', 50),
      ).rejects.toThrowError('Minting is only allowed on test networks.');
    });

    test('should return transaction if minted successfully', async () => {
      expect.assertions(1);
      await expect(raiden.mint(token, 50, { to: raiden.address })).resolves.toMatch(
        /^0x[0-9a-fA-F]{64}$/,
      );
    });
  });

  describe('UDC', () => {
    test('deposit 0 tokens', async () => {
      expect.assertions(1);
      await expect(raiden.depositToUDC(0)).rejects.toThrow('positive');
    });

    test('try to deposit without enough balance', async () => {
      expect.assertions(1);
      await expect(raiden.depositToUDC(100)).rejects.toThrow('Insufficient balance');
    });

    test('deposit success', async () => {
      expect.assertions(3);
      await raiden.mint(await raiden.userDepositTokenAddress(), 20);
      await expect(raiden.depositToUDC(10)).resolves.toMatch(/^0x[0-9a-fA-F]{64}$/);
      await expect(raiden.depositToUDC(5)).resolves.toMatch(/^0x[0-9a-fA-F]{64}$/);
      await expect(raiden.getUDCCapacity()).resolves.toEqual(BigNumber.from(15));
    });

    test('withdraw success!', async () => {
      expect.assertions(7);
      const deposit = BigNumber.from(100) as UInt<32>;
      const newDeposit = BigNumber.from(30) as UInt<32>;
      const withdraw = BigNumber.from(80) as UInt<32>;
      await raiden.mint(await raiden.userDepositTokenAddress(), deposit);
      await expect(raiden.depositToUDC(deposit)).resolves.toMatch(/^0x[0-9a-fA-F]{64}$/);
      await expect(raiden.getUDCCapacity()).resolves.toEqual(deposit);
      await expect(raiden.planUdcWithdraw(withdraw)).resolves.toMatch(/^0x[0-9a-fA-F]{64}$/);

      const result = raiden.action$.pipe(filter(udcWithdrawn.is), take(2), toArray()).toPromise();
      await provider.mine(100 + confirmationBlocks * 2);

      await expect(raiden.getUDCCapacity()).resolves.toEqual(deposit.sub(withdraw));
      await expect(result).resolves.toEqual([
        udcWithdrawn(expect.objectContaining({ withdrawal: withdraw, confirmed: undefined }), {
          amount: withdraw,
        }),
        udcWithdrawn(expect.objectContaining({ withdrawal: withdraw, confirmed: true }), {
          amount: withdraw,
        }),
      ]);

      await expect(raiden.depositToUDC(newDeposit)).resolves.toMatch(/^0x[0-9a-fA-F]{64}$/);
      await provider.mine(confirmationBlocks * 2);
      await expect(raiden.getUDCCapacity()).resolves.toEqual(
        deposit.sub(withdraw).add(newDeposit),
      );
    });

    test('withdraw success with restart', async () => {
      expect.assertions(5);
      const deposit = BigNumber.from(100) as UInt<32>;
      const withdraw = BigNumber.from(80) as UInt<32>;
      await raiden.mint(await raiden.userDepositTokenAddress(), deposit);
      await expect(raiden.depositToUDC(deposit)).resolves.toMatch(/^0x[0-9a-fA-F]{64}$/);
      await expect(raiden.getUDCCapacity()).resolves.toEqual(deposit);
      await expect(raiden.planUdcWithdraw(withdraw)).resolves.toMatch(/^0x[0-9a-fA-F]{64}$/);

      // stop and restart node
      raiden.stop();
      await provider.mine(confirmationBlocks);
      raiden = await createRaiden(0);
      raiden.start();

      const result = raiden.action$.pipe(filter(udcWithdrawn.is), take(2), toArray()).toPromise();
      await provider.mine(100 + confirmationBlocks);

      await expect(raiden.getUDCCapacity()).resolves.toEqual(deposit.sub(withdraw));
      await expect(result).resolves.toEqual([
        udcWithdrawn(expect.objectContaining({ withdrawal: withdraw, confirmed: undefined }), {
          amount: withdraw,
        }),
        udcWithdrawn(expect.objectContaining({ withdrawal: withdraw, confirmed: true }), {
          amount: withdraw,
        }),
      ]);
    });

    test('withdraw failure zero amount', async () => {
      expect.assertions(1);
      await expect(raiden.planUdcWithdraw(0)).rejects.toThrow(
        'The planned withdraw amount has to be greater than zero.',
      );
    });

    test('withdraw failure zero balance', async () => {
      expect.assertions(1);
      await expect(raiden.planUdcWithdraw(10)).rejects.toThrow(
        'The planned withdraw amount exceeds the total amount available for withdrawing.',
      );
    });
  });

  test('subkey', async () => {
    expect.assertions(30);
    const sub = await createRaiden(0, undefined, true);

    const subStarted = sub.action$.pipe(filter(isActionOf(matrixSetup)), first()).toPromise();
    sub.start();
    await subStarted;

    expect(sub.mainAddress).toBe(raiden.address);
    expect(sub.address).toMatch(/^0x/);

    const mainBalance = await sub.getBalance(sub.mainAddress);
    const subBalance = await sub.getBalance(sub.address);

    expect(mainBalance.gt(Zero)).toBe(true);
    expect(subBalance.isZero()).toBe(true);

    // no parameters get main balance instead of sub balance
    await expect(sub.getBalance()).resolves.toEqual(mainBalance);

    const mainTokenBalance = await sub.getTokenBalance(token, sub.mainAddress);

    // no gas to pay for tx with subkey
    await expect(sub.openChannel(token, partner, { subkey: true })).rejects.toThrowError(
      /doesn't have enough funds.*\bonly has: 0\b/,
    );

    await expect(sub.openChannel(token, partner)).resolves.toMatch(/^0x/);
    await expect(sub.depositChannel(token, partner, 200)).resolves.toMatch(/^0x/);

    // txs above should spend gas from main account
    const newMainBalance = await sub.getBalance(sub.mainAddress);
    expect(newMainBalance.gt(Zero)).toBe(true);
    expect(newMainBalance.lt(mainBalance)).toBe(true);

    // as well as tokens
    const newMainTokenBalance = await sub.getTokenBalance(token, sub.mainAddress);
    expect(newMainTokenBalance).toEqual(mainTokenBalance.sub(200));

    let closeTxHash = await sub.closeChannel(token, partner);
    expect(closeTxHash).toMatch(/^0x/);
    let closeTx = await provider.getTransaction(closeTxHash);
    await provider.mineUntil(closeTx.blockNumber! + config.settleTimeout! + 1);
    await sub.channels$
      .pipe(first((c) => c[token]?.[partner]?.state === ChannelState.settleable))
      .toPromise();
    await expect(sub.settleChannel(token, partner)).resolves.toMatch(/^0x/);

    // settled tokens go to subkey
    expect((await sub.getTokenBalance(token, sub.address)).eq(200)).toBe(true);

    const bal = parseEther('0.1');
    await expect(sub.transferOnchainBalance(sub.address, bal)).resolves.toMatch(/^0x/);

    // sent ETH from main account to subkey, gas paid from main account
    expect((await sub.getBalance()).lt(newMainTokenBalance.sub(bal))).toBe(true);
    expect((await sub.getBalance(sub.address)).eq(bal)).toBe(true);

    // now with subkey, as it has ETH, through on-chain method param
    await expect(sub.openChannel(token, partner, { subkey: true })).resolves.toMatch(/^0x/);
    // first deposit fails, as subkey has only 200 tokens settled from previous channel
    await expect(sub.depositChannel(token, partner, 300, { subkey: true })).rejects.toThrow(
      ErrorCodes.RDN_INSUFFICIENT_BALANCE,
    );
    await expect(sub.depositChannel(token, partner, 80, { subkey: true })).resolves.toMatch(/^0x/);

    await provider.mine();

    // test changing through config.subkey
    sub.updateConfig({ subkey: true });

    closeTxHash = await sub.closeChannel(token, partner);
    expect(closeTxHash).toMatch(/^0x/);
    closeTx = await provider.getTransaction(closeTxHash);
    expect(closeTx.from).toBe(sub.address);

    await provider.mineUntil(closeTx.blockNumber! + config.settleTimeout! + 1);
    await sub.channels$
      .pipe(first((c) => c[token]?.[partner]?.state === ChannelState.settleable))
      .toPromise();
    await expect(sub.settleChannel(token, partner)).resolves.toMatch(/^0x/);

    // gas for close+settle paid from subkey
    expect((await sub.getBalance(sub.address)).lt(bal)).toBe(true);
    // settled tokens go to subkey
    expect((await sub.getTokenBalance(token, sub.address)).eq(200)).toBe(true);

    // transfer on chain from subkey to main account
    await expect(sub.transferOnchainTokens(token, sub.mainAddress!)).resolves.toMatch(/^0x/);
    // config.subkey is true, transfering ETH to mainAddress without specifying value should transfer everything
    await expect(sub.transferOnchainBalance(sub.mainAddress!)).resolves.toMatch(/^0x/);
    expect((await sub.getTokenBalance(token)).isZero()).toBe(true);
    expect((await sub.getTokenBalance(token, sub.mainAddress)).eq(mainTokenBalance)).toBe(true);
    // subkey is emptied of ETH
    expect((await sub.getBalance()).isZero()).toBe(true);
  });

  describe('suggestPartners', () => {
    test('success with one PFS', async () => {
      expect.assertions(2);
      await raiden.monitorToken(token);

      // pfsInfo
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
      });
      raiden.updateConfig({ pfs: pfsUrl }); // pfs set

      const suggestResponse = [
        {
          address: accounts[1],
          capacity: '17',
          centrality: '0.01',
          score: '99',
          uptime: 120000,
        },
      ];
      // suggest_partner
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => suggestResponse),
        text: jest.fn(async () => jsonStringify(suggestResponse)),
      });

      await expect(raiden.suggestPartners(token)).resolves.toEqual([
        {
          address: suggestResponse[0].address,
          capacity: BigNumber.from(suggestResponse[0].capacity),
          centrality: suggestResponse[0].centrality,
          score: suggestResponse[0].score,
          uptime: suggestResponse[0].uptime,
        },
      ]);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/suggest_partner$/),
        expect.anything(),
      );
    });

    test('success with empty response from one PFS', async () => {
      expect.assertions(2);
      await raiden.monitorToken(token);

      // pfsInfo
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
      });
      raiden.updateConfig({ pfs: pfsUrl }); // pfs set

      const suggestResponse: {
        address: string;
        capacity: string;
        centrality: string;
        score: string;
        uptime: number;
      }[] = [];
      // suggest_partner
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => suggestResponse),
        text: jest.fn(async () => jsonStringify(suggestResponse)),
      });

      await expect(raiden.suggestPartners(token)).resolves.toEqual([]);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/suggest_partner$/),
        expect.anything(),
      );
    });

    test('throws with error from one PFS', async () => {
      expect.assertions(2);
      await raiden.monitorToken(token);

      // pfsInfo
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => jsonStringify(pfsInfoResponse)),
      });
      raiden.updateConfig({ pfs: pfsUrl }); // pfs set
      // suggest_partner
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: jest.fn(async () => ({ error: 'not found' })),
        text: jest.fn(async () => '{"error":"not found"}'),
      });

      await expect(raiden.suggestPartners(token)).rejects.toMatchObject({
        message: expect.stringMatching('Invalid value'),
      });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/suggest_partner$/),
        expect.anything(),
      );
    });

    test('returns data when second PFS replies', async () => {
      expect.assertions(2);
      await raiden.monitorToken(token);

      raiden.findPFS = jest.fn().mockResolvedValueOnce(['pfs1', 'pfs2']);
      raiden.updateConfig({ pfs: '' }); // set empty PFS, will trigger `findPFS`

      const suggestResponse1: {
        address: string;
        capacity: string;
        centrality: string;
        score: string;
        uptime: number;
      }[] = [];
      // suggest_partner
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => suggestResponse1),
        text: jest.fn(async () => jsonStringify(suggestResponse1)),
      });
      const suggestResponse = [
        {
          address: accounts[1],
          capacity: '17',
          centrality: '0.01',
          score: '99',
          uptime: 120000,
        },
      ];
      // suggest_partner
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => suggestResponse),
        text: jest.fn(async () => jsonStringify(suggestResponse)),
      });

      await expect(raiden.suggestPartners(token)).resolves.toEqual([
        {
          address: suggestResponse[0].address,
          capacity: BigNumber.from(suggestResponse[0].capacity),
          centrality: suggestResponse[0].centrality,
          score: suggestResponse[0].score,
          uptime: suggestResponse[0].uptime,
        },
      ]);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/suggest_partner$/),
        expect.anything(),
      );
    });

    test('returns empty list when second PFS answers after failure', async () => {
      expect.assertions(2);
      await raiden.monitorToken(token);

      raiden.findPFS = jest.fn().mockResolvedValueOnce(['pfs1', 'pfs2']);
      raiden.updateConfig({ pfs: '' }); // set empty PFS, will trigger `findPFS`

      // suggest_partner
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: jest.fn(async () => ({ error: 'not found' })),
        text: jest.fn(async () => '{"error":"not found"}'),
      });

      const suggestResponse2: {
        address: string;
        capacity: string;
        centrality: string;
        score: string;
        uptime: number;
      }[] = [];
      // suggest_partner
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => suggestResponse2),
        text: jest.fn(async () => jsonStringify(suggestResponse2)),
      });

      await expect(raiden.suggestPartners(token)).resolves.toEqual([]);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/suggest_partner$/),
        expect.anything(),
      );
    });

    test("returns best result when PFS' return different data", async () => {
      expect.assertions(2);
      await raiden.monitorToken(token);

      raiden.findPFS = jest.fn().mockResolvedValueOnce(['pfs1', 'pfs2']);
      raiden.updateConfig({ pfs: '' }); // set empty PFS, will trigger `findPFS`

      const suggestResponseEmpty: {
        address: string;
        capacity: string;
        centrality: string;
        score: string;
        uptime: number;
      }[] = [];
      // suggest_partner
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => suggestResponseEmpty),
        text: jest.fn(async () => jsonStringify(suggestResponseEmpty)),
      });

      const suggestResponse = [
        {
          address: accounts[1],
          capacity: '17',
          centrality: '0.01',
          score: '99',
          uptime: 120000,
        },
      ];
      // suggest_partner
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => suggestResponse),
        text: jest.fn(async () => jsonStringify(suggestResponse)),
      });

      await expect(raiden.suggestPartners(token)).resolves.toEqual([
        {
          address: suggestResponse[0].address,
          capacity: BigNumber.from(suggestResponse[0].capacity),
          centrality: suggestResponse[0].centrality,
          score: suggestResponse[0].score,
          uptime: suggestResponse[0].uptime,
        },
      ]);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/suggest_partner$/),
        expect.anything(),
      );
    });
  });
});
