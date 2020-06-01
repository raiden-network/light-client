/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { JsonRpcProvider } from 'ethers/providers';
import type { Network, Arrayish, Signature } from 'ethers/utils';
import { getAddress } from 'ethers/utils/address';
import { HashZero } from 'ethers/constants';

// ethers utils mock to skip slow elliptic sign/verify
export const patchVerifyMessage = () => {
  jest.mock('ethers/utils/secp256k1', () => {
    const origSepc256k1 = jest.requireActual<typeof import('ethers/utils/secp256k1')>(
      'ethers/utils/secp256k1',
    );
    const { KeyPair, computeAddress } = origSepc256k1;
    class MockedKeyPair extends KeyPair {
      private _address?: string;
      sign({}: Arrayish | string): Signature {
        if (!this._address) this._address = computeAddress(this.publicKey);
        return {
          r: HashZero,
          s: HashZero.substr(0, 24) + this._address!.substr(2) + '00',
          recoveryParam: 0,
          v: 27,
        };
      }
    }
    return {
      ...origSepc256k1,
      __esModule: true,
      KeyPair: MockedKeyPair,
      verifyMessage: jest.fn((msg: string, sig: string): string => {
        // TODO: remove userId special case after mockedMatrixCreateClient is used
        const match = /^@(0x[0-9a-f]{40})[.:]/i.exec(msg);
        if (match?.[1]) return getAddress(match[1]);
        return getAddress('0x' + sig.substr(-44, 40));
      }),
    };
  });
};

// raiden-ts/utils.getNetwork has the same functionality as provider.getNetwork
// but fetches everytime instead of just returning a cached property
// On mocked tests, we unify both again, so we can just mock provider.getNetwork in-place
export const patchEthersGetNetwork = () =>
  jest.mock('raiden-ts/utils/ethers', () => ({
    ...jest.requireActual<typeof import('raiden-ts/utils/ethers')>('raiden-ts/utils/ethers'),
    __esModule: true,
    getNetwork: jest.fn((provider: JsonRpcProvider): Promise<Network> => provider.getNetwork()),
  }));

// ethers's contracts use a lot defineReadOnly which doesn't allow us to mock
// functions and properties. Mock it here so we can mock later
export const patchEthersDefineReadOnly = () =>
  jest.mock('ethers/utils/properties', () => ({
    ...jest.requireActual<typeof import('ethers/utils/properties')>('ethers/utils/properties'),
    __esModule: true,
    defineReadOnly: jest.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (object: any, name: string, value: any): void =>
        Object.defineProperty(object, name, {
          enumerable: true,
          value,
          writable: true,
          configurable: true,
        }),
    ),
  }));
