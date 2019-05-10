import makeBlockie from 'ethereum-blockies-base64';
import { IdenticonCache } from '@/services/identicon-cache';
jest.mock('ethereum-blockies-base64');

describe('IdenticonCache', function() {
  let cache: IdenticonCache;

  beforeEach(() => {
    cache = new IdenticonCache();
    const generator: jest.Mock<any> = makeBlockie as any;
    generator.mockClear();
    generator.mockReturnValue('1');
  });

  it('should generate the icon if the icon is not cached', function() {
    let icon = cache.getIdenticon('0xaddr');
    expect(makeBlockie).toHaveBeenCalledTimes(1);
    expect(icon).toEqual('1');
  });

  it('should fetch the icon if it is already cached', function() {
    let icon = cache.getIdenticon('0xaddr');
    let icon2 = cache.getIdenticon('0xaddr');
    expect(makeBlockie).toHaveBeenCalledTimes(1);
    expect(icon).toEqual('1');
    expect(icon2).toEqual('1');
  });
});
