import { txFailErrors, txNonceErrors } from 'raiden-ts/channels/utils';
import { networkErrorRetryPredicate, networkErrors } from 'raiden-ts/utils/error';

describe('networkErrorRetryPredicate', () => {
  test('handles non-error objects correctly', () => {
    const errorString = 'Test';
    const errorNumber = 123;
    const errorObject = { name: 'goerli', chainId: 5 };

    expect(networkErrorRetryPredicate(errorString)).toBe(true);
    expect(networkErrorRetryPredicate(errorNumber)).toBe(true);
    expect(networkErrorRetryPredicate(errorObject)).toBe(true);
  });

  test('returns `False` for network errors only', () => {
    const networkError = Error(networkErrors[0]);
    const nonceError = Error(txNonceErrors[0]);
    const failError = Error(txFailErrors[0]);

    expect(networkErrorRetryPredicate(networkError)).toBe(false);
    expect(networkErrorRetryPredicate(nonceError)).toBe(true);
    expect(networkErrorRetryPredicate(failError)).toBe(true);
  });
});
