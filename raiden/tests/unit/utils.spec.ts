import { first } from 'rxjs/operators';

import { fromEthersEvent } from 'raiden/utils';
import { raidenEpicDeps } from './mocks';

describe('fromEthersEvent', () => {
  const { provider } = raidenEpicDeps();

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('event registered and emitted', async () => {
    const promise = fromEthersEvent<number>(provider, 'block')
      .pipe(first())
      .toPromise();
    provider.emit('block', 1337);

    const blockNumber = await promise;

    expect(blockNumber).toBe(1337);
    expect(provider.on).toHaveBeenCalledTimes(1);
    expect(provider.removeListener).toHaveBeenCalledTimes(1);
  });
});
