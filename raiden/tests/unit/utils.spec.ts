// import { of } from 'rxjs';
import { first } from 'rxjs/operators';
import { JsonRpcProvider } from 'ethers/providers';

import { fromEthersEvent } from 'raiden/utils';

describe('fromEthersEvent', () => {
  test('event registered and emitted', done => {
    const provider = new JsonRpcProvider();

    fromEthersEvent<number>(provider, 'block')
      .pipe(first())
      .subscribe(blockNumber => {
        expect(blockNumber).toBe(1337);
        done();
      });
    provider.emit('block', 1337);
  });
});
