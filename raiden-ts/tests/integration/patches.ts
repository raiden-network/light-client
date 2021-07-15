/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAddress } from '@ethersproject/address';
import type { BytesLike, Signature, SignatureLike } from '@ethersproject/bytes';
import { HashZero } from '@ethersproject/constants';
import type { Network } from '@ethersproject/networks';
import type { JsonRpcProvider } from '@ethersproject/providers';

// ethers utils mock to skip slow elliptic sign/verify

let mockOrigComputeAddress: (key: BytesLike | string) => string;
jest.mock('@ethersproject/transactions', () => {
  const actual = jest.requireActual<any>('@ethersproject/transactions');
  mockOrigComputeAddress = actual.computeAddress;
  return {
    ...actual,
    __esModule: true,
    computeAddress: jest.fn((sig: string): string => {
      if (sig.startsWith('0x00000000')) return getAddress('0x' + sig.substr(-44, 40));
      return mockOrigComputeAddress(sig);
    }),
  };
});

jest.mock('@ethersproject/wallet', () => {
  return {
    ...jest.requireActual<any>('@ethersproject/wallet'),
    __esModule: true,
    verifyMessage: jest.fn((_: string, sig: string): string =>
      getAddress('0x' + sig.substr(-44, 40)),
    ),
  };
});

jest.mock('@ethersproject/signing-key', () => {
  const origSigning = jest.requireActual<any>('@ethersproject/signing-key');
  const { SigningKey } = origSigning;
  class MockedSigningKey extends SigningKey {
    private _address?: string;
    signDigest({}: BytesLike): Signature {
      if (!this._address) this._address = mockOrigComputeAddress(this.publicKey);
      const s = HashZero.substr(0, 24) + this._address!.substr(2).toLowerCase() + '00';
      return {
        r: HashZero,
        s,
        _vs: s,
        recoveryParam: 0,
        v: 27,
      };
    }
  }
  return {
    ...origSigning,
    __esModule: true,
    SigningKey: MockedSigningKey,
    recoverPublicKey: (_: BytesLike, signature: SignatureLike) => signature,
  };
});

// raiden-ts/utils.getNetwork has the same functionality as provider.getNetwork
// but fetches everytime instead of just returning a cached property
// On mocked tests, we unify both again, so we can just mock provider.getNetwork in-place
jest.mock('@/utils/ethers', () => ({
  ...jest.requireActual<any>('@/utils/ethers'),
  __esModule: true,
  getNetwork: jest.fn((provider: JsonRpcProvider): Promise<Network> => provider.getNetwork()),
}));

// ethers's contracts use a lot defineReadOnly which doesn't allow us to mock
// functions and properties. Mock it here so we can mock later
jest.mock('@ethersproject/properties', () => ({
  ...jest.requireActual<any>('@ethersproject/properties'),
  __esModule: true,
  defineReadOnly: jest.fn((object: any, name: string, value: any): void =>
    Object.defineProperty(object, name, {
      enumerable: true,
      value,
      writable: true,
      configurable: true,
    }),
  ),
}));
