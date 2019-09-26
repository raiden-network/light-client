import { Zero } from 'ethers/constants';
import { Dictionary } from 'vue-router/types/router';

import { checkTokenNetworkRoute } from '../../src/router';
import { Tokens } from '../../src/types';
import { Token } from '../../src/model/types';

const mockToken = (address: string): Token => ({
  address: address,
  balance: Zero,
  units: '0.0',
  decimals: 18,
  name: address,
  symbol: address.replace('0x', '').toLocaleUpperCase()
});

describe('route guards', () => {
  describe('token network guard', () => {
    const path = '/connect/0x1234567890';
    let next: jest.Mock<any, any>;
    let tokens: Tokens;
    let params: Dictionary<string>;

    beforeEach(() => {
      params = {};
      tokens = {};
      next = jest.fn();
    });

    it('should redirect to home if token network address is not in store', () => {
      params.token = '0x1234567890';
      checkTokenNetworkRoute(params, next, tokens);
      expect(next).toHaveBeenCalledWith('/');
    });

    it('should not redirect if token network address is in store', () => {
      const address = '0x1234567890';
      tokens[address] = mockToken(address);
      params.token = address;
      checkTokenNetworkRoute(params, next, tokens);

      // Tests whether `next` has been called with no arguments
      expect(next).toHaveBeenCalledWith();
    });

    it('should not redirect if there is no token parameter', () => {
      const address = '0x1234567890';
      tokens[address] = mockToken(address);
      checkTokenNetworkRoute(params, next, tokens);

      // Tests whether `next` has been called with no arguments
      expect(next).toHaveBeenCalledWith();
    });
  });
});
