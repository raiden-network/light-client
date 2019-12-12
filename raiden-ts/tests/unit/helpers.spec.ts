import { Network } from 'ethers/utils';
import { JsonRpcProvider } from 'ethers/providers';

import { getContracts, getSigner } from 'raiden-ts/raiden/helpers';
import { Wallet } from 'ethers';

describe('getContracts', () => {
  test('return contracts if network is ropsten, rinkeby or goerli', async () => {
    const ropstenNetwork = { name: 'ropsten', chainId: 3 } as Network;
    const rinkebyNetwork = { name: 'rinkeby', chainId: 4 } as Network;
    const goerliNetwork = { name: 'goerli', chainId: 5 } as Network;

    expect(getContracts(ropstenNetwork)).toHaveProperty('TokenNetworkRegistry');
    expect(getContracts(ropstenNetwork)).toHaveProperty('ServiceRegistry');
    expect(getContracts(ropstenNetwork)).toHaveProperty('UserDeposit');
    expect(getContracts(rinkebyNetwork)).toHaveProperty('TokenNetworkRegistry');
    expect(getContracts(rinkebyNetwork)).toHaveProperty('ServiceRegistry');
    expect(getContracts(rinkebyNetwork)).toHaveProperty('UserDeposit');
    expect(getContracts(goerliNetwork)).toHaveProperty('TokenNetworkRegistry');
    expect(getContracts(goerliNetwork)).toHaveProperty('ServiceRegistry');
    expect(getContracts(goerliNetwork)).toHaveProperty('UserDeposit');
  });

  test('throw if network is not supported', async () => {
    const mainNetwork = { name: 'homestead', chainId: 1 } as Network;
    expect(() => getContracts(mainNetwork)).toThrow();
  });
});

describe('getSigner', () => {
  const walletAddress = '0x3333333333333333333333333333333333333333333333333333333333333333';

  test("return account if account's provider is the expected provider", async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = new Wallet(walletAddress, provider);

    expect(await getSigner(account, provider)).toBe(account);
  });

  test("connect account with provider if account's provider is different from entered provider", async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = new Wallet(walletAddress);

    expect(await getSigner(account, provider)).toStrictEqual(account.connect(provider));
  });

  test('returns signer from provider if account is a number', async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = 1;

    expect(await getSigner(account, provider)).toStrictEqual(provider.getSigner(account));
  });
});
