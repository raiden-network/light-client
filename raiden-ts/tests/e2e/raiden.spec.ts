/* eslint-disable @typescript-eslint/camelcase */
import { first, filter } from 'rxjs/operators';
import { Zero } from 'ethers/constants';
import { parseEther, parseUnits, bigNumberify, BigNumber, keccak256, Network } from 'ethers/utils';
import { getType, isActionOf } from 'typesafe-actions';
import { get } from 'lodash';

import { TestProvider } from './provider';
import { MockStorage, MockMatrixRequestFn } from './mocks';

import { request } from 'matrix-js-sdk';

import 'raiden-ts/polyfills';
import { Raiden } from 'raiden-ts/raiden';
import { ShutdownReason } from 'raiden-ts/constants';
import { makeInitialState, RaidenState } from 'raiden-ts/state';
import { raidenShutdown } from 'raiden-ts/actions';
import { newBlock, tokenMonitored } from 'raiden-ts/channels/actions';
import { ChannelState } from 'raiden-ts/channels/state';
import { Storage, Secret, Address } from 'raiden-ts/utils/types';
import { ContractsInfo } from 'raiden-ts/types';
import { RaidenConfig } from 'raiden-ts/config';
import { RaidenSentTransfer, RaidenSentTransferStatus } from 'raiden-ts/transfers/state';
import { makeSecret, getSecrethash } from 'raiden-ts/transfers/utils';
import { matrixSetup } from 'raiden-ts/transport/actions';
import { losslessStringify } from 'raiden-ts/utils/data';
import { ServiceRegistryFactory } from 'raiden-ts/contracts/ServiceRegistryFactory';

describe('Raiden', () => {
  const provider = new TestProvider();
  let accounts: string[],
    contractsInfo: ContractsInfo,
    snapId: number | undefined,
    raiden: Raiden,
    storage: jest.Mocked<Storage>,
    token: string,
    tokenNetwork: string,
    partner: string,
    network: Network,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pfsInfoResponse: any,
    pfsAddress: string,
    pfsUrl: string;
  const config: Partial<RaidenConfig> = { settleTimeout: 20, revealTimeout: 5 };

  let httpBackend: MockMatrixRequestFn;
  const matrixServer = 'matrix.raiden.test';

  const fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json: jest.fn(async () => ({} as any)),
    text: jest.fn(async () => `- ${matrixServer}`),
  }));
  Object.assign(global, { fetch });

  beforeAll(async () => {
    jest.setTimeout(40e3);

    contractsInfo = await provider.deployRegistry();
    ({ token, tokenNetwork } = await provider.deployTokenNetwork(contractsInfo));
    accounts = await provider.listAccounts();
    partner = accounts[1];
    network = await provider.getNetwork();

    const serviceRegistryContract = ServiceRegistryFactory.connect(
        contractsInfo.ServiceRegistry.address,
        provider,
      ),
      events = await provider.getLogs({
        ...serviceRegistryContract.filters.RegisteredService(null, null, null, null),
        fromBlock: 0,
        toBlock: 'latest',
      }),
      parsed = serviceRegistryContract.interface.parseLog(events[0]);
    pfsAddress = parsed.values[0] as string;
    pfsUrl = await serviceRegistryContract.functions.urls(pfsAddress);

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
    snapId = await provider.snapshot();
    storage = new MockStorage();

    // setup matrix mock http backend
    httpBackend = new MockMatrixRequestFn(matrixServer);
    request(httpBackend.requestFn.bind(httpBackend));

    raiden = await Raiden.create(provider, 0, storage, contractsInfo, config);
    raiden.start();
    // wait token register to be fetched
    await raiden.getTokenList();
  });

  afterEach(() => {
    raiden.stop();
    httpBackend.stop();
  });

  test('create from other params and RaidenState', async () => {
    expect.assertions(10);

    // token address not found as an account in provider
    await expect(Raiden.create(provider, token, storage, contractsInfo, config)).rejects.toThrow(
      /Account.*not found in provider/i,
    );

    // neither account index, address nor private key
    await expect(
      Raiden.create(provider, '0x1234', storage, contractsInfo, config),
    ).rejects.toThrow(/account must be either.*address or private key/i);

    // from hex-encoded private key, initial unknown state (decodable) but invalid address inside
    await expect(
      Raiden.create(
        provider,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        JSON.stringify(
          makeInitialState({ network, contractsInfo, address: token as Address }, { config }),
        ),
        contractsInfo,
      ),
    ).rejects.toThrow(/Mismatch between provided account and loaded state/i);

    await expect(
      Raiden.create(
        provider,
        1,
        JSON.stringify(
          makeInitialState(
            {
              network,
              contractsInfo: {
                // eslint-disable-next-line @typescript-eslint/camelcase
                TokenNetworkRegistry: { address: token as Address, block_number: 0 },
                // eslint-disable-next-line @typescript-eslint/camelcase
                ServiceRegistry: { address: partner as Address, block_number: 1 },
                // eslint-disable-next-line @typescript-eslint/camelcase
                UserDeposit: { address: partner as Address, block_number: 2 },
              },
              address: accounts[1] as Address,
            },
            { config },
          ),
        ),
        contractsInfo,
      ),
    ).rejects.toThrow(/Mismatch between network or registry address and loaded state/i);

    // success when using address of account on provider and initial state
    const raiden1 = await Raiden.create(
      provider,
      accounts[1],
      makeInitialState({ network, contractsInfo, address: accounts[1] as Address }, { config }),
      contractsInfo,
      config,
    );
    expect(raiden1).toBeInstanceOf(Raiden);

    // test Raiden.started, not yet started
    expect(raiden1.started).toBeUndefined();
    raiden1.start();
    expect(raiden1.started).toBe(true);
    raiden1.stop();
    expect(raiden1.started).toBe(false);

    // success when creating using subkey
    const raiden2 = await Raiden.create(provider, 0, storage, contractsInfo, config, true);
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
      pfsRoom: 'raiden_1338_path_finding',
      settleTimeout: 20,
      revealTimeout: 5,
    });
    expect(raiden.config.pfs).toBeUndefined();
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

  describe('getUDCCapacity', () => {
    test('no balance', async () => {
      expect.assertions(1);
      await expect(raiden.getUDCCapacity()).resolves.toEqual(Zero);
    });

    test('mint and deposit', async () => {
      expect.assertions(1);
      await raiden.mint(await raiden.userDepositTokenAddress(), 10);
      await raiden.depositToUDC(10);
      await expect(raiden.getUDCCapacity()).resolves.toEqual(bigNumberify(10));
    });
  });

  describe('openChannel', () => {
    test('tx fail', async () => {
      expect.assertions(1);
      // settleTimeout < min
      await expect(
        raiden.openChannel(token, partner, { settleTimeout: config.settleTimeout! - 1 }),
      ).rejects.toThrow();
    });

    test('success with default settleTimeout=20', async () => {
      expect.assertions(2);
      await expect(raiden.openChannel(token, partner)).resolves.toMatch(/^0x/);
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toMatchObject({
        [token]: {
          [partner]: {
            token,
            tokenNetwork,
            partner,
            state: ChannelState.open,
            ownDeposit: Zero,
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
            ownDeposit: bigNumberify(300),
            balance: Zero,
            capacity: bigNumberify(300),
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
      raiden1 = await Raiden.create(provider, partner, undefined, contractsInfo, config);
      raiden1.start();
    });

    afterEach(() => {
      raiden1.stop();
    });

    test('partner instance fetches events fired before instantiation', async () => {
      await expect(
        raiden1.channels$
          .pipe(
            filter(
              channels => get(channels, [token, raiden.address, 'state']) === ChannelState.open,
            ),
            filter(channels => !!get(channels, [token, raiden.address, 'partnerDeposit'])),
            filter(channels => get(channels, [token, raiden.address, 'partnerDeposit']).gt(0)),
            first(),
          )
          .toPromise(), // resolves on first emitted value which passes all filters above
      ).resolves.toMatchObject({
        [token]: {
          [raiden.address]: {
            state: ChannelState.open,
            ownDeposit: Zero,
            partnerDeposit: bigNumberify(200),
          },
        },
      });
    });

    test('raiden instance fetches new events which happened while it was offline', async () => {
      expect.assertions(7);

      // wait for raiden1 to pick up main tokenNetwork channel
      await expect(
        raiden1.state$
          .pipe(first(state => !!get(state.channels, [tokenNetwork, raiden.address])))
          .toPromise(),
      ).resolves.toMatchObject({
        tokens: {
          [token]: tokenNetwork,
        },
        channels: {
          [tokenNetwork]: { [raiden.address]: { state: ChannelState.open } },
        },
      });

      let raidenState: RaidenState | undefined;
      raiden.state$.subscribe(state => (raidenState = state));
      raiden.stop();
      expect(raidenState!.tokens).toEqual({ [token]: tokenNetwork });
      // expect & save block when raiden was stopped
      expect(raidenState).toMatchObject({ blockNumber: expect.any(Number) });
      const stopBlock = raidenState!.blockNumber;

      // edge case 1: ChannelClosed event happens right after raiden is stopped
      await raiden1.closeChannel(token, raiden.address);
      await provider.mine(2);

      // deploy new token network while raiden is offline (raiden1/partner isn't)
      const { token: newToken, tokenNetwork: newTokenNetwork } = await provider.deployTokenNetwork(
        contractsInfo,
      );
      await provider.mine(4);

      // open a new channel from partner to main instance on the new tokenNetwork
      // edge case 2: ChannelOpened at exact block when raiden is restarted
      await raiden1.openChannel(newToken, raiden.address);
      const restartBlock = provider.blockNumber;

      raidenState = undefined;
      raiden = await Raiden.create(provider, 0, storage, contractsInfo, config);
      raiden.state$.subscribe(state => (raidenState = state));
      raiden.start();

      // ensure after hot boot, state is rehydrated and contains (only) previous token
      expect(raidenState).toBeDefined();
      expect(raidenState!.tokens).toEqual({ [token]: tokenNetwork });

      // wait token & channel on it to be fetched, even if it happened while we were offline
      await expect(
        raiden.state$
          .pipe(
            filter(state => state.tokens[newToken] === newTokenNetwork),
            first(state => !!get(state.channels, [newTokenNetwork, partner])),
          )
          .toPromise(),
      ).resolves.toMatchObject({
        tokens: {
          [token]: tokenNetwork,
          [newToken]: newTokenNetwork,
        },
        channels: {
          // test edge case 1: channel closed at stop block is picked up correctly
          [tokenNetwork]: { [partner]: { state: ChannelState.closed, closeBlock: stopBlock + 1 } },
          // test edge case 2: channel opened at restart block is picked up correctly
          [newTokenNetwork]: { [partner]: { state: ChannelState.open, openBlock: restartBlock } },
        },
      });
      // test sync state$ subscribe
      expect(get(raidenState!.channels, [newTokenNetwork, partner])).toBeDefined();
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
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toMatchObject({
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
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toEqual({
        [token]: {},
      });
    }, 90e3);
  });

  describe('events$', () => {
    test('stop shutdown', async () => {
      const promise = raiden.events$.toPromise();
      raiden.stop();
      await expect(promise).resolves.toMatchObject({
        type: getType(raidenShutdown),
        payload: { reason: ShutdownReason.STOP },
      });
    });

    test('newBlock', async () => {
      expect.assertions(1);
      await provider.mine(5);
      const promise = raiden.events$
        .pipe(
          filter(value => value.type === 'newBlock'),
          first(),
        )
        .toPromise();
      await provider.mine(10);
      await expect(promise).resolves.toMatchObject({
        type: getType(newBlock),
        payload: { blockNumber: expect.any(Number) },
      });
    });

    test('tokenMonitored', async () => {
      expect.assertions(1);
      await provider.mine(5);
      const promise = raiden.events$
        .pipe(first(value => value.type === 'tokenMonitored' && !!value.payload.fromBlock))
        .toPromise();
      await provider.mine(5);
      // deploy a new token & tokenNetwork
      const { token, tokenNetwork } = await provider.deployTokenNetwork(contractsInfo);
      await expect(promise).resolves.toMatchObject({
        type: getType(tokenMonitored),
        payload: { fromBlock: expect.any(Number), token, tokenNetwork },
      });
    });
  });

  describe('matrix', () => {
    test('getAvailability', async () => {
      expect.assertions(3);

      await expect(raiden.getAvailability(partner)).rejects.toThrow(
        'Could not find any user with valid signature for',
      );

      // success when using address of account on provider and initial state
      const raiden1 = await Raiden.create(
        provider,
        accounts[2],
        makeInitialState({ network, contractsInfo, address: accounts[2] as Address }, { config }),
        contractsInfo,
      );
      expect(raiden1).toBeInstanceOf(Raiden);
      raiden1.start();

      // await raiden1 client matrix initialization
      await raiden1.action$.pipe(filter(isActionOf(matrixSetup)), first()).toPromise();

      await expect(raiden.getAvailability(accounts[2])).resolves.toMatchObject({
        userId: `@${accounts[2].toLowerCase()}:${matrixServer}`,
        available: true,
        ts: expect.any(Number),
      });

      raiden1.stop();
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
        /Invalid value.*UInt/i,
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
        /Invalid value.*UInt/i,
      );
    });

    test('invalid provided metadata/route', async () => {
      expect.assertions(1);
      await expect(
        raiden.transfer(token, partner, 23, {
          paths: [{ path: ['0xnotAnAddress'], fee: 0 }],
        }),
      ).rejects.toThrowError(/Invalid value.*Address/i);
    });

    test('target not available', async () => {
      expect.assertions(1);
      await expect(raiden.transfer(token, partner, 21)).rejects.toThrowError(
        /\btarget.*not online\b/i,
      );
    });

    describe('partner online', () => {
      // partner's client instance
      let raiden1: Raiden;

      beforeEach(async () => {
        raiden1 = await Raiden.create(
          provider,
          partner,
          makeInitialState({ network, contractsInfo, address: partner as Address }, { config }),
          contractsInfo,
        );
        raiden1.start();

        // await raiden1 client matrix initialization
        await raiden1.action$.pipe(filter(isActionOf(matrixSetup)), first()).toPromise();

        await expect(raiden.getAvailability(partner)).resolves.toMatchObject({
          userId: `@${partner.toLowerCase()}:${matrixServer}`,
          available: true,
          ts: expect.any(Number),
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      afterEach(() => raiden1.stop());

      test('fail: direct channel without enough capacity, pfs disabled', async () => {
        expect.assertions(2);
        raiden.updateConfig({ pfs: null });
        await expect(raiden.transfer(token, partner, 201)).rejects.toThrowError(
          /no direct route/i,
        );
      });

      test('success: direct route', async () => {
        expect.assertions(4);

        const transfers: { [h: string]: RaidenSentTransfer } = {};
        raiden.transfers$.subscribe(t => (transfers[t.secrethash] = t));

        const secrethash = await raiden.transfer(token, partner, 23);
        expect(secrethash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        expect(secrethash in transfers).toBe(true);
        expect(transfers[secrethash].status).toBe(RaidenSentTransferStatus.pending);
      });

      test('success: auto pfs route', async () => {
        expect.assertions(7);

        const target = accounts[2],
          raiden2 = await Raiden.create(
            provider,
            target,
            makeInitialState({ network, contractsInfo, address: target as Address }, { config }),
            contractsInfo,
          ),
          matrix2Promise = raiden2.action$
            .pipe(filter(isActionOf(matrixSetup)), first())
            .toPromise();

        raiden2.start();
        // await raiden2 client matrix initialization
        await matrix2Promise;

        await expect(raiden.getAvailability(target)).resolves.toMatchObject({
          userId: `@${target.toLowerCase()}:${matrixServer}`,
          available: true,
          ts: expect.any(Number),
        });
        await new Promise(resolve => setTimeout(resolve, 100));

        // auto pfs mode
        raiden.updateConfig({ pfs: undefined });

        fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn(async () => pfsInfoResponse),
          text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
        });

        fetch.mockResolvedValueOnce({
          ok: true,
          status: 404,
          json: jest.fn(async () => {
            /* error */
          }),
          text: jest.fn(async () => losslessStringify({})),
        });

        const result = {
          result: [
            // first returned route is invalid and should be filtered
            // eslint-disable-next-line @typescript-eslint/camelcase
            { path: [tokenNetwork, target], estimated_fee: 0 },
            // eslint-disable-next-line @typescript-eslint/camelcase
            { path: [partner, target], estimated_fee: 0 },
          ],
          // eslint-disable-next-line @typescript-eslint/camelcase
          feedback_token: '0xfeedback',
        };
        fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn(async () => result),
          text: jest.fn(async () => losslessStringify(result)),
        });

        const transfers: { [h: string]: RaidenSentTransfer } = {};
        raiden.transfers$.subscribe(t => (transfers[t.secrethash] = t));

        const secrethash = await raiden.transfer(token, target, 23);
        expect(secrethash).toMatch(/^0x[0-9a-fA-F]{64}$/);

        expect(secrethash in transfers).toBe(true);
        expect(transfers[secrethash].status).toBe(RaidenSentTransferStatus.pending);

        // transfer metadata contains the actual used routes (removing invalid ones)
        expect(transfers[secrethash].metadata).toEqual({
          routes: [{ route: [partner, target] }],
        });

        expect(fetch).toHaveBeenCalledWith(
          expect.stringMatching(new RegExp(`^${pfsUrl}/.*/${tokenNetwork}/paths$`)),
          expect.objectContaining({ method: 'POST' }),
        );

        raiden2.stop();
      });
    });
  });

  describe('findPFS', () => {
    test('fail config.pfs disabled', async () => {
      expect.assertions(1);

      raiden.updateConfig({ pfs: null }); // disabled pfs
      await expect(raiden.findPFS()).rejects.toThrowError('PFS disabled in config');
    });

    test('success: config.pfs set', async () => {
      expect.assertions(1);

      // pfsInfo
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
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
        text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
      });

      raiden.updateConfig({ pfs: undefined });
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

    beforeAll(() => jest.setTimeout(50e3));

    beforeEach(async () => {
      target = accounts[2];

      await raiden.openChannel(token, partner);
      await raiden.depositChannel(token, partner, 200);

      raiden1 = await Raiden.create(
        provider,
        partner,
        makeInitialState({ network, contractsInfo, address: partner as Address }, { config }),
        contractsInfo,
      );
      raiden2 = await Raiden.create(
        provider,
        target,
        makeInitialState({ network, contractsInfo, address: target as Address }, { config }),
        contractsInfo,
      );
      raiden1.start();
      raiden2.start();

      // await client's matrix initialization
      await Promise.all([
        raiden1.action$.pipe(filter(isActionOf(matrixSetup)), first()).toPromise(),
        raiden2.action$.pipe(filter(isActionOf(matrixSetup)), first()).toPromise(),
      ]);

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
      await new Promise(resolve => setTimeout(resolve, 100));

      raiden.updateConfig({ pfs: pfsUrl });
    });

    afterEach(() => {
      raiden1.stop();
      raiden2.stop();
    });

    test('success with config.pfs', async () => {
      expect.assertions(4);

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 404,
        json: jest.fn(async () => {
          /* error */
        }),
        text: jest.fn(async () => losslessStringify({})),
      });

      const result = {
        result: [
          // first returned route is invalid and should be filtered
          // eslint-disable-next-line @typescript-eslint/camelcase
          { path: [tokenNetwork, target], estimated_fee: 0 },
          // eslint-disable-next-line @typescript-eslint/camelcase
          { path: [raiden.address, partner, target], estimated_fee: 0 },
        ],
        // eslint-disable-next-line @typescript-eslint/camelcase
        feedback_token: '0xfeedback',
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => result),
        text: jest.fn(async () => losslessStringify(result)),
      });

      await expect(raiden.findRoutes(token, target, 23)).resolves.toEqual([
        { path: [partner, target], fee: bigNumberify(0) },
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
        text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
      });

      // config.pfs in auto mode
      raiden.updateConfig({ pfs: undefined });

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
        text: jest.fn(async () => losslessStringify({})),
      });

      const result = {
        result: [
          // first returned route is invalid and should be filtered
          // eslint-disable-next-line @typescript-eslint/camelcase
          { path: [tokenNetwork, target], estimated_fee: 0 },
          // eslint-disable-next-line @typescript-eslint/camelcase
          { path: [raiden.address, partner, target], estimated_fee: 0 },
        ],
        // eslint-disable-next-line @typescript-eslint/camelcase
        feedback_token: '0xfeedback',
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => result),
        text: jest.fn(async () => losslessStringify(result)),
      });

      await expect(raiden.findRoutes(token, target, 23, { pfs: pfss[0] })).resolves.toEqual([
        { path: [partner, target], fee: bigNumberify(0) },
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
      expect.assertions(3);

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => pfsInfoResponse),
        text: jest.fn(async () => losslessStringify(pfsInfoResponse)),
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 404,
        json: jest.fn(async () => {
          /* error */
        }),
        text: jest.fn(async () => losslessStringify({})),
      });

      const result = {
        result: [
          // first returned route is invalid and should be filtered
          // eslint-disable-next-line @typescript-eslint/camelcase
          { path: [tokenNetwork, target], estimated_fee: 0 },
          // eslint-disable-next-line @typescript-eslint/camelcase
          { path: [raiden.address, partner, target], estimated_fee: 0 },
        ],
        // eslint-disable-next-line @typescript-eslint/camelcase
        feedback_token: '0xfeedback',
      };
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn(async () => result),
        text: jest.fn(async () => losslessStringify(result)),
      });

      await expect(raiden.findRoutes(token, target, 201)).rejects.toThrowError(
        /no valid routes found/,
      );
    });

    test('directRoute', async () => {
      expect.assertions(5);

      await expect(raiden.directRoute(token, target, 23)).resolves.toBeUndefined();

      await expect(raiden.directRoute(token, partner, 201)).resolves.toBeUndefined();

      await expect(raiden.directRoute(token, partner, 23)).resolves.toEqual([
        { path: [partner], fee: bigNumberify(0) },
      ]);
    });
  });

  describe('mint', () => {
    test('should throw exception if invalid address', async () => {
      expect.assertions(1);
      await expect(raiden.mint('0xTokenNetwork', 50)).rejects.toThrowError('Invalid address');
    });

    test('should throw exception on main net', async () => {
      expect.assertions(1);
      raiden = await Raiden.create(
        new TestProvider({ network_id: 1 }),
        0,
        storage,
        contractsInfo,
        config,
      );
      raiden.start();
      await expect(
        raiden.mint('0x3a989D97388a39A0B5796306C615d10B7416bE77', 50),
      ).rejects.toThrowError('Minting is only allowed on test networks.');
      raiden.stop();
    });

    test('should return transaction if minted successfully', async () => {
      expect.assertions(1);
      await expect(raiden.mint(token, 50)).resolves.toMatch(/^0x[0-9a-fA-F]{64}$/);
    });
  });

  describe('depositToUDC', () => {
    test('deposit 0 tokens', async () => {
      expect.assertions(1);
      await expect(raiden.depositToUDC(0)).rejects.toThrow('Please deposit a positive amount.');
    });

    test('deposit without a token balance', async () => {
      expect.assertions(1);
      await expect(raiden.depositToUDC(100)).rejects.toThrow('Insufficient token balance (0).');
    });

    test('deposit success', async () => {
      expect.assertions(1);
      await raiden.mint(await raiden.userDepositTokenAddress(), 10);
      await expect(raiden.depositToUDC(10)).resolves.toMatch(/^0x[0-9a-fA-F]{64}$/);
    });
  });

  test('subkey', async () => {
    expect.assertions(28);
    const sub = await Raiden.create(provider, 0, storage, contractsInfo, config, true);

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

    await expect(sub.closeChannel(token, partner)).resolves.toMatch(/^0x/);
    await provider.mine(config.settleTimeout! + 1);
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
      'revert',
    );
    await expect(sub.depositChannel(token, partner, 80, { subkey: true })).resolves.toMatch(/^0x/);

    await provider.mine();

    // test changing through config.subkey
    sub.updateConfig({ subkey: true });

    const closeTxHash = await sub.closeChannel(token, partner);
    expect(closeTxHash).toMatch(/^0x/);
    const closeTx = await provider.getTransaction(closeTxHash);
    expect(closeTx.from).toBe(sub.address);

    await provider.mine(config.settleTimeout! + 1);
    await expect(sub.settleChannel(token, partner)).resolves.toMatch(/^0x/);

    // gas for close+settle paid from subkey
    expect((await sub.getBalance(sub.address)).lt(bal)).toBe(true);
    // settled tokens go to subkey
    expect((await sub.getTokenBalance(token, sub.address)).eq(200)).toBe(true);

    // transfer on chain from subkey to main account
    await expect(sub.transferOnchainTokens(token, sub.mainAddress!, 200)).resolves.toMatch(/^0x/);
    expect((await sub.getTokenBalance(token)).isZero()).toBe(true);
    expect((await sub.getTokenBalance(token, sub.mainAddress)).eq(mainTokenBalance)).toBe(true);

    sub.stop();
  });
});
