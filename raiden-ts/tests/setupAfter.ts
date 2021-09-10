import 'jest-extended';

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BigNumberish } from '@ethersproject/bignumber';
import { BigNumber } from '@ethersproject/bignumber';

// expect.toBeBigNumber to match a BigNumber using typeguard instead of instanceof
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Expect {
      toBeBigNumber(expected?: BigNumberish): any;
    }
    interface Matchers<R> {
      toBeBigNumber(expected?: BigNumberish): R;
    }
  }
}

expect.extend({
  toBeBigNumber(received?: any, expected?: BigNumberish) {
    if (!BigNumber.isBigNumber(received))
      return { pass: false, message: () => `${JSON.stringify(received)} is not a BigNumber` };
    if (expected && !received.eq(expected)) {
      return {
        pass: false,
        message: () => `expected BigNumber=${expected}, but received=${received.toString()}`,
      };
    }
    return { pass: true, message: () => '' };
  },
});
