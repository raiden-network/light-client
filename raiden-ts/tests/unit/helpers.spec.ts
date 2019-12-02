import { Network } from 'ethers/utils';
import { JsonRpcProvider, JsonRpcSigner } from 'ethers/providers';

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
  const walletPK = '0x3333333333333333333333333333333333333333333333333333333333333333';

  test("return account if account's provider is the expected provider", async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = new Wallet(walletPK, provider);

    await expect(getSigner(account, provider)).resolves.toEqual({
      signer: account,
      address: account.address,
      main: undefined,
    });
  });

  test("connect account with provider if account's provider is different from entered provider", async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = new Wallet(walletPK);

    await expect(getSigner(account, provider)).resolves.toStrictEqual({
      signer: account.connect(provider),
      address: account.address,
      main: undefined,
    });
  });

  test('returns signer from provider if account is a number', async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = 0;
    const address = '0x0000000000000000000000000000000000020001';

    jest.spyOn(provider, 'send').mockResolvedValueOnce([address]);

    await expect(getSigner(account, provider)).resolves.toStrictEqual({
      signer: expect.any(JsonRpcSigner),
      address,
      main: undefined,
    });
  });

  test('return subkey signer with main account', async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = new Wallet(walletPK, provider);

    jest.spyOn(provider, 'getNetwork').mockResolvedValueOnce({ name: 'test', chainId: 1338 });

    await expect(getSigner(account, provider, true)).resolves.toEqual({
      signer: expect.any(Wallet),
      address: expect.stringMatching(/^0x/),
      main: { signer: account, address: account.address },
    });
  });
});
