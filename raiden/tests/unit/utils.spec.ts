import { first } from 'rxjs/operators';
import { JsonRpcProvider } from 'ethers/providers';

import { fromEthersEvent } from 'raiden/utils';

describe('fromEthersEvent', () => {
  const provider = new JsonRpcProvider();
  const onSpy = jest.spyOn(provider, 'on');
  const removeListenerSpy = jest.spyOn(provider, 'removeListener');

  afterEach(() => {
    onSpy.mockClear();
    removeListenerSpy.mockClear();
  });

  test('event registered and emitted', async () => {
    const promise = fromEthersEvent<number>(provider, 'block')
      .pipe(first())
      .toPromise();
    provider.emit('block', 1337);

    const blockNumber = await promise;

    expect(blockNumber).toBe(1337);
    expect(onSpy).toHaveBeenCalledTimes(1);
    expect(removeListenerSpy).toHaveBeenCalledTimes(1);
  });
});
