# Installing and Importing the SDK

```bash
npm install raiden-ts
```

Then in your JavaScript or TypeScript project:

```typescript
import { Raiden } from 'raiden-ts';

# async factory
const raiden = await Raiden.create(web3.currentProvider, 0, localStorage);
```

This async factory is required as a lot of initialization code is asynchronous, and we want to provide simpler building blocks for you to get from zero to iterating with the Raiden Network through this SDK in the simplest way possible. Despite that, if you're brave enough or have the need, you can always create the instances and fill the constructor parameters by yourself. Just be very careful to persist and rehydrate the state and constants correctly before starting.

After you're done, you may want to call `raiden.stop()` to trigger all observables to complete and streams to be unsubscribed. It's not required though, as state changes are atomic (non-async) and Raiden can be rehydrated from any intermediary state. However, if you finish before an asynchronous operation was completed, you may need to re-send it. e.g. if you call `raiden.closeChannel` and your app exits before the transaction was sent and the promise resolved, your channel will be left in the `closing` state (as state was already notified and persisted that this channel was about to be closed and couldn't be used anymore), and you may need to call `closeChannel` again to actually send the transaction (even over the `closing` state) and wait until it is mined and your channel actually becomes `closed`.

Once you got your `raiden` instance, the public API should be pretty straightforward: most of the methods return Promises, allowing you to async/await on them, and output comes either from the resolved value or public Observables which exposes current state and state changes to the world on common parameters (like token address instead of specific token network contract address).

Channels are mostly specified through the first two parameters: `token` and `partner` addresses, as Raiden contracts currently limit the number of channels in open at any given time to some specific partner to 1.