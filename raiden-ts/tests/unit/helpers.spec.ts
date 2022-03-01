import { JsonRpcProvider, JsonRpcSigner } from '@ethersproject/providers';
import { toUtf8String } from '@ethersproject/strings';
import { Wallet } from '@ethersproject/wallet';

import { getSigner } from '@/helpers';
import Raiden from '@/raiden';
import type { Address } from '@/utils/types';

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

    await expect(getSigner(account, provider)).resolves.toMatchObject({
      signer: { address: account.address, provider },
      address: account.address,
      main: undefined,
    });
  });

  test('returns signer from provider if account is a number', async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = 0;
    const address = '0x0000000000000000000000000000000000020001' as Address;

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

  test('subkey generation uses default origin for missing global context', async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = new Wallet(walletPK, provider);
    const signMessageSpy = jest.spyOn(account, 'signMessage');
    jest.spyOn(provider, 'getNetwork').mockResolvedValueOnce({ name: 'test', chainId: 1338 });

    await getSigner(account, provider, true);

    expect(signMessageSpy).toHaveBeenCalledTimes(1);
    const messageBytes = signMessageSpy.mock.calls[0][0];
    const messageText = toUtf8String(messageBytes);
    expect(messageText.includes('Raiden dApp URL: unknown')).toBeTrue();
  });

  // TODO: test case for subkey generatino with globalThis.location.origin

  test('subkey generation uses specific origin url if defined', async () => {
    const provider = new JsonRpcProvider() as jest.Mocked<JsonRpcProvider>;
    const account = new Wallet(walletPK, provider);
    const signMessageSpy = jest.spyOn(account, 'signMessage');
    jest.spyOn(provider, 'getNetwork').mockResolvedValueOnce({ name: 'test', chainId: 1338 });

    await getSigner(account, provider, true, 'https://test.it');

    expect(signMessageSpy).toHaveBeenCalledTimes(1);
    const messageBytes = signMessageSpy.mock.calls[0][0];
    const messageText = toUtf8String(messageBytes);
    expect(messageText.includes('Raiden dApp URL: https://test.it')).toBeTrue();
  });
});

describe('Raiden Versions', () => {
  const someVersion = /[0-9.]+/;
  test('Returns raiden version', () => {
    expect(Raiden.version).toMatch(someVersion);
  });

  test('Returns raiden contract version', () => {
    expect(Raiden.contractVersion).toMatch(someVersion);
  });
});
