import { first, filter } from 'rxjs/operators';
import { Zero } from 'ethers/constants';
import { parseEther, parseUnits, bigNumberify, BigNumber } from 'ethers/utils';
import { getType } from 'typesafe-actions';
import { get } from 'lodash';

jest.mock('cross-fetch');
import fetch from 'cross-fetch';

import { TestProvider } from './provider';
import { MockStorage, MockMatrixRequestFn } from './mocks';

import { request } from 'matrix-js-sdk';

import { Raiden } from 'raiden/raiden';
import { ShutdownReason } from 'raiden/constants';
import { initialState } from 'raiden/store';
import { raidenShutdown, newBlock } from 'raiden/store/actions';
import { ChannelState } from 'raiden/channels';
import { Storage } from 'raiden/utils/types';
import { ContractsInfo, RaidenContracts } from 'raiden/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any

describe('Raiden', () => {
  const provider = new TestProvider();
  let accounts: string[];
  let info: ContractsInfo;
  let snapId: number | undefined;
  let raiden: Raiden;
  let storage: jest.Mocked<Storage>;
  let token: string, tokenNetwork: string;
  let partner: string;

  let httpBackend: MockMatrixRequestFn;
  let matrixServer = 'matrix.raiden.test';

  beforeAll(async () => {
    jest.setTimeout(10e3);

    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn(async () => `- ${matrixServer}`),
    });

    let contracts: RaidenContracts;
    [info, contracts] = await provider.deployRaidenContracts();
    token = Object.keys(contracts.tokens)[0];
    tokenNetwork = Object.keys(contracts.tokenNetworks)[0];
    accounts = await provider.listAccounts();
    partner = accounts[1];
  });

  beforeEach(async () => {
    if (snapId !== undefined) await provider.revert(snapId);
    snapId = await provider.snapshot();
    storage = new MockStorage();

    // setup matrix mock http backend
    httpBackend = new MockMatrixRequestFn(matrixServer);
    request(httpBackend.requestFn.bind(httpBackend));

    raiden = await Raiden.create(provider, 0, storage, info);
    // wait token register to be fetched
    await raiden.getTokenList();
  });

  afterEach(() => {
    raiden.stop();
    httpBackend.stop();
  });

  test('create from other params and RaidenState', async () => {
    expect.assertions(4);

    // token address not found as an account in provider
    await expect(Raiden.create(provider, token, storage, info)).rejects.toThrow(
      /Account.*not found in provider/i,
    );

    // neither account index, address nor private key
    await expect(Raiden.create(provider, '0x1234', storage, info)).rejects.toThrow(
      /account must be either.*address or private key/i,
    );

    // from hex-encoded private key, initial unknown state (decodable) but invalid address inside
    expect(
      Raiden.create(
        provider,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        JSON.stringify({ ...initialState, address: token }),
        info,
      ),
    ).rejects.toThrow(/Mismatch between provided account and loaded state/i);

    // success when using address of account on provider and initial state
    const raiden1 = await Raiden.create(
      provider,
      accounts[1],
      { ...initialState, address: accounts[1] },
      info,
    );
    expect(raiden1).toBeInstanceOf(Raiden);
    raiden1.stop();
  });

  test('address', () => {
    expect.assertions(1);
    expect(raiden.address).toBe(accounts[0]);
  });

  test('getBlockNumber', async () => {
    expect.assertions(1);
    await expect(raiden.getBlockNumber()).resolves.toBeGreaterThanOrEqual(
      info.TokenNetworkRegistry.block_number,
    );
  });

  test('getBalance', async () => {
    expect.assertions(1);
    await expect(raiden.getBalance()).resolves.toEqual(parseEther('5'));
  });

  describe('getTokenBalance', () => {
    test('non-monitored token', async () => {
      expect.assertions(1);
      await expect(raiden.getTokenBalance(partner)).rejects.toThrow();
    });

    test('success', async () => {
      expect.assertions(1);
      await expect(raiden.getTokenBalance(token)).resolves.toEqual(parseUnits('1000', 18));
    });
  });

  describe('getTokenInfo', () => {
    test('non-monitored token', async () => {
      expect.assertions(1);
      await expect(raiden.getTokenInfo(partner)).rejects.toThrow();
    });

    test('success', async () => {
      expect.assertions(1);
      await expect(raiden.getTokenInfo(token)).resolves.toEqual({
        totalSupply: expect.any(BigNumber),
        decimals: 18,
        name: 'TestToken',
        symbol: 'TKN',
      });
    });
  });

  describe('openChannel', () => {
    test('tx fail', async () => {
      expect.assertions(1);
      // settleTimeout < min of 500
      await expect(raiden.openChannel(token, partner, 499)).rejects.toThrow();
    });

    test('success with default settleTimeout=500', async () => {
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
            settleTimeout: 500,
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
      raiden1 = await Raiden.create(provider, partner, undefined, info);
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
      await provider.mine(501);
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
    }, 60e3);
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
      const promise = raiden.events$.pipe(first()).toPromise();
      await provider.mine(10);
      await expect(promise).resolves.toMatchObject({
        type: getType(newBlock),
        payload: { blockNumber: expect.any(Number) },
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
        { ...initialState, address: accounts[2] },
        info,
      );
      expect(raiden1).toBeInstanceOf(Raiden);

      await new Promise(resolve => setTimeout(resolve, 1000));

      await expect(raiden.getAvailability(accounts[2])).resolves.toMatchObject({
        userId: `@${accounts[2].toLowerCase()}:${matrixServer}`,
        available: true,
        ts: expect.any(Number),
      });

      raiden1.stop();
    });
  });
});
