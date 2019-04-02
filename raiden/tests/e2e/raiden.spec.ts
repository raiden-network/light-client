import { first } from 'rxjs/operators';
import { parseEther, parseUnits, bigNumberify } from 'ethers/utils';

import { TestProvider } from './provider';

import { Raiden } from 'raiden/raiden';
import { ContractsInfo, RaidenContracts, ChannelState } from 'raiden/types';

describe('Raiden', () => {
  const provider = new TestProvider();
  let accounts: string[];
  let info: ContractsInfo;
  let snapId: number | undefined;
  let raiden: Raiden;
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
    raiden = await Raiden.create(provider, 0, undefined, info);
  });

  afterEach(() => {
    raiden.stop();
  });

  test('address', () => {
    expect(raiden.address).toBe(accounts[0]);
  });

  test('getBlockNumber', async () => {
    await expect(raiden.getBlockNumber()).resolves.toBeGreaterThanOrEqual(
      info.TokenNetworkRegistry.block_number,
    );
  });

  test('monitorToken', async () => {
    await expect(raiden.monitorToken(token)).resolves.toBe(tokenNetwork);
  });

  test('getBalance', async () => {
    await expect(raiden.getBalance()).resolves.toEqual(parseEther('5'));
  });

  describe('getTokenBalance', () => {
    test('non-monitored token', async () => {
      await expect(raiden.getTokenBalance(token)).rejects.toThrow();
    });

    test('success', async () => {
      await raiden.monitorToken(token);
      await expect(raiden.getTokenBalance(token)).resolves.toEqual({
        balance: parseUnits('1000', 18),
        decimals: 18,
      });
    });
  });

  describe('openChannel', () => {
    test('tx fail', async () => {
      // settleTimeout < min of 500
      await expect(raiden.openChannel(token, partner, 499)).rejects.toThrow();
    });

    test('success', async () => {
      await expect(raiden.openChannel(token, partner, 500)).resolves.toMatch(/^0x/);
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toMatchObject({
        [token]: {
          [partner]: {
            token,
            tokenNetwork,
            partner,
            state: 'open',
            totalDeposit: bigNumberify(0),
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
      // deposit bigger than balance (1k tokens)
      await expect(
        raiden.depositChannel(token, partner, parseUnits('2000', 18)),
      ).rejects.toThrow();
    });

    test('success', async () => {
      await expect(raiden.depositChannel(token, partner, 100)).resolves.toMatch(/^0x/);
      await expect(raiden.channels$.pipe(first()).toPromise()).resolves.toMatchObject({
        [token]: {
          [partner]: {
            token,
            tokenNetwork,
            partner,
            state: ChannelState.open,
            totalDeposit: bigNumberify(100),
          },
        },
      });
    });
  });
});
