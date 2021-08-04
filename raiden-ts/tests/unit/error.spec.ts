import { defer, lastValueFrom } from 'rxjs';

import { matchError } from '@/utils/error';
import { retryWhile } from '@/utils/rx';

describe('matchError', () => {
  test('matches error.message substrings', () => {
    const matcher = ['a randomError'];
    const randomError = new Error('this is a randomError');
    expect(matchError(matcher, randomError)).toBe(true);
    // also tests matcher return
    expect(matchError(matcher)(randomError)).toBe(true);

    const anotherError = new Error('this is another error');
    expect(matchError(matcher, anotherError)).toBe(false);
    expect(matchError(matcher)(anotherError)).toBe(false);
  });

  test('matches error.httpStatus', () => {
    const matcher = [429, 500];
    const rateError = Object.assign(new Error('Invalid http status code'), { httpStatus: 429 });
    expect(matchError(matcher, rateError)).toBe(true);
    expect(matchError(matcher)(rateError)).toBe(true);

    const notFoundError = Object.assign(new Error('Not found'), { httpStatus: 404 });
    expect(matchError(matcher, notFoundError)).toBe(false);
    expect(matchError(matcher)(notFoundError)).toBe(false);
  });

  test('matches properties', () => {
    const matcher = [{ code: 'timeout' }];
    const timeoutError = Object.assign(new Error('Timeout occurred'), { code: 'timeout' });
    expect(matchError(matcher, timeoutError)).toBe(true);
    expect(matchError(matcher)(timeoutError)).toBe(true);

    const nonCodeTimeout = new Error('timeout');
    expect(matchError(matcher, nonCodeTimeout)).toBe(false);
    expect(matchError(matcher)(nonCodeTimeout)).toBe(false);
  });
});

describe('retryWhile', () => {
  const error = new Error('defaultError');
  const errorMock = jest.fn();
  const error$ = defer(errorMock);

  beforeEach(() => {
    errorMock.mockRestore();
    errorMock.mockRejectedValue(error);
  });

  test('give up after maxRetries', async () => {
    const start = Date.now();
    await expect(lastValueFrom(error$.pipe(retryWhile(5, { maxRetries: 7 })))).rejects.toThrow(
      error,
    );
    expect(errorMock).toHaveBeenCalledTimes(8);
    expect(Date.now() - start).toBeGreaterThanOrEqual(7 * 5);
  });

  test('retry only onError', async () => {
    const anotherError = new Error('anotherError');
    errorMock.mockRejectedValueOnce(anotherError);
    await expect(
      lastValueFrom(error$.pipe(retryWhile(5, { onErrors: ['another'] }))),
    ).rejects.toThrow(error);
    expect(errorMock).toHaveBeenCalledTimes(2);
  });

  test('retry until neverOnError', async () => {
    const anotherError = new Error('anotherError');
    errorMock.mockRejectedValueOnce(anotherError);
    await expect(
      lastValueFrom(error$.pipe(retryWhile(5, { neverOnErrors: ['default'] }))),
    ).rejects.toThrow(error);
    expect(errorMock).toHaveBeenCalledTimes(2);
  });

  test('retry only on predicate, succeeds 2nd time', async () => {
    const anotherError = new Error('anotherError');
    errorMock.mockRejectedValueOnce(anotherError);
    errorMock.mockResolvedValueOnce(37);
    const predicate = jest.fn((err) => err === anotherError);
    await expect(lastValueFrom(error$.pipe(retryWhile(5, { predicate })))).resolves.toBe(37);
    expect(errorMock).toHaveBeenCalledTimes(2);
    expect(predicate).toHaveBeenCalledTimes(1);
  });

  test('give up on stopPredicate, logs error', async () => {
    const anotherError = new Error('anotherError');
    errorMock.mockRejectedValueOnce(anotherError);
    const stopPredicate = jest.fn((err) => err === error);
    const log = jest.fn();
    await expect(
      lastValueFrom(error$.pipe(retryWhile(5, { stopPredicate, log }))),
    ).rejects.toThrow(error);
    expect(errorMock).toHaveBeenCalledTimes(2);
    expect(stopPredicate).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(2);
  });

  test('give up when iterator depletes', async () => {
    const arr = [5, 4, 3];
    const iter = arr[Symbol.iterator]();
    await expect(lastValueFrom(error$.pipe(retryWhile(iter)))).rejects.toThrow(error);
    expect(errorMock).toHaveBeenCalledTimes(4);
  });
});
