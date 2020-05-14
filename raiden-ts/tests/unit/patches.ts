/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock('ethers/providers');
import { JsonRpcProvider } from 'ethers/providers';
import { Network } from 'ethers/utils';

// ethers utils mock to always validate matrix userIds/displayName
export const patchVerifyMessage = () =>
  jest.mock('ethers/utils', () => ({
    ...jest.requireActual<any>('ethers/utils'),
    verifyMessage: jest.fn((msg: string, sig: string): string => {
      const { getAddress, verifyMessage: origVerifyMessage } = jest.requireActual('ethers/utils');
      const match = /^@(0x[0-9a-f]{40})[.:]/i.exec(msg);
      if (match && match[1]) return getAddress(match[1]);
      return origVerifyMessage(msg, sig);
    }),
  }));

// raiden-ts/utils.getNetwork has the same functionality as provider.getNetwork
// but fetches everytime instead of just returning a cached property
// On mocked tests, we unify both again, so we can just mock provider.getNetwork in-place
export const patchMatrixGetNetwork = () =>
  jest.mock('raiden-ts/utils/matrix', () => ({
    ...jest.requireActual<any>('raiden-ts/utils/matrix'),
    getNetwork: jest.fn((provider: JsonRpcProvider): Promise<Network> => provider.getNetwork()),
  }));

// ethers's contracts use a lot defineReadOnly which doesn't allow us to mock
// functions and properties. Mock it here so we can mock later
export const patchEthersDefineReadOnly = () =>
  jest.mock('ethers/utils/properties', () => ({
    ...jest.requireActual<any>('ethers/utils/properties'),
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
