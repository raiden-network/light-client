import { first, filter } from 'rxjs/operators';
import { parseEther, parseUnits, bigNumberify } from 'ethers/utils';
import { get } from 'lodash';

import { TestProvider } from './provider';
import { MockStorage } from './mocks';

import { Raiden } from 'raiden/raiden';
import { initialState } from 'raiden/store';
import { ContractsInfo, RaidenContracts, ChannelState, Storage } from 'raiden/types';

describe('Raiden', () => {
  const provider = new TestProvider();
  let accounts: string[];
  let info: ContractsInfo;
  let snapId: number | undefined;
  let raiden: Raiden;
  let storage: jest.Mocked<Storage>;
  let token: string, tokenNetwork: string;
  let partner: string;

  beforeAll(async () => {
    jest.setTimeout(15e3);
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
    raiden = await Raiden.create(provider, 0, storage, info);
  });

  afterEach(() => {
    raiden.stop();
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

    // from hex-encoded private key, initial state but invalid address on state
    expect(
      Raiden.create(
        provider,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        {
          ...initialState,
          address: token,
        },
        info,
      ),
    ).rejects.toThrow(/Mismatch between provided account and loaded state/i);

    // success when using address of account on provider and initial state
    const raiden1 = await Raiden.create(
      provider,
      accounts[1],
      {
        ...initialState,
        address: accounts[1],
      },
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
      await expect(raiden.getTokenBalance(token)).rejects.toThrow();
    });

    test('success', async () => {
      expect.assertions(1);
      await raiden.monitorToken(token);
      await expect(raiden.getTokenBalance(token)).resolves.toEqual({
        balance: parseUnits('1000', 18),
        decimals: 18,
      });
    });
  });

  describe('monitorToken', () => {
    test('fail', async () => {
      expect.assertions(1);
      await expect(raiden.monitorToken(tokenNetwork)).rejects.toThrow();
    });

    test('success', async () => {
      expect.assertions(1);
      await expect(raiden.monitorToken(token)).resolves.toBe(tokenNetwork);
    });
  });

  describe('openChannel', () => {
    test('tx fail', async () => {
      expect.assertions(1);
      await raiden.monitorToken(token);
      // settleTimeout < min of 500
      await expect(raiden.openChannel(token, partner, 499)).rejects.toThrow();
    });

    test('success', async () => {
      expect.assertions(2);
      await expect(raiden.openChannel(token, partner, 500)).resolves.toMatch(/^0x/);
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toMatchObject({
        [token]: {
          [partner]: {
            token,
            tokenNetwork,
            partner,
            state: ChannelState.open,
            totalDeposit: bigNumberify(0),
            partnerDeposit: bigNumberify(0),
          },
        },
      });
    });
  });

  describe('depositChannel', () => {
    beforeEach(async () => {
      await raiden.openChannel(token, partner, 500);
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
            totalDeposit: bigNumberify(300),
          },
        },
      });
    });
  });

  describe('raiden can fetch past events', () => {
    let raiden1: Raiden;

    beforeEach(async () => {
      await raiden.openChannel(token, partner, 500);
      await raiden.depositChannel(token, partner, 200);
      raiden1 = await Raiden.create(provider, partner, undefined, info);
    });

    afterEach(() => {
      raiden1.stop();
    });

    test('partner instance fetches events fired before instantiation', async () => {
      raiden1.monitorToken(token);
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
            totalDeposit: bigNumberify(0),
            partnerDeposit: bigNumberify(200),
          },
        },
      });
    });
  });

  describe('closeChannel', () => {
    beforeEach(async () => {
      await raiden.openChannel(token, partner, 500);
      await raiden.depositChannel(token, partner, 200);
    });

    test('no channel with address', async () => {
      expect.assertions(1);
      // there's no channel with partner=token
      await expect(raiden.closeChannel(token, token)).rejects.toThrow();
    });

    test('success', async () => {
      expect.assertions(3);
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
});
