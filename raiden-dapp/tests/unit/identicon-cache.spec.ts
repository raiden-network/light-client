jest.mock('ethereum-blockies-base64');

import makeBlockie from 'ethereum-blockies-base64';
import { IdenticonCache } from '@/services/identicon-cache';

describe('IdenticonCache', () => {
  let cache: IdenticonCache;

  beforeEach(() => {
    cache = new IdenticonCache();
    const generator: jest.Mock = makeBlockie as any;
    generator.mockClear();
    generator.mockReturnValue('1');
  });

  test('generates the icon when there is no icon cached', () => {
    const icon = cache.getIdenticon('0xaddr');
    expect(makeBlockie).toHaveBeenCalledTimes(1);
    expect(icon).toEqual('1');
  });

  test('fetches the icon from cache when it is already cached', () => {
    const icon = cache.getIdenticon('0xaddr');
    const icon2 = cache.getIdenticon('0xaddr');
    expect(makeBlockie).toHaveBeenCalledTimes(1);
    expect(icon).toEqual('1');
    expect(icon2).toEqual('1');
  });
});
