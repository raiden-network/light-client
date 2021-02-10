import makeBlockie from 'ethereum-blockies-base64';

import { IdenticonCache } from '@/services/identicon-cache';

jest.mock('ethereum-blockies-base64');

describe('IdenticonCache', () => {
  let cache: IdenticonCache;

  beforeEach(() => {
    cache = new IdenticonCache();
    const generator = makeBlockie as jest.MockedFunction<typeof makeBlockie>;
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
