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

  test('should generate the icon if the icon is not cached', () => {
    let icon = cache.getIdenticon('0xaddr');
    expect(makeBlockie).toHaveBeenCalledTimes(1);
    expect(icon).toEqual('1');
  });

  test('should fetch the icon if it is already cached', () => {
    let icon = cache.getIdenticon('0xaddr');
    let icon2 = cache.getIdenticon('0xaddr');
    expect(makeBlockie).toHaveBeenCalledTimes(1);
    expect(icon).toEqual('1');
    expect(icon2).toEqual('1');
  });
});
