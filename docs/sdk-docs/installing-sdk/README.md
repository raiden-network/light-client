# Install and Import the SDK

You can install the Raiden SDK as a node module by running:

```bash
npm install raiden-ts
```

After installing the SDK you can simply import Raiden to your JavaScript or TypeScript project.

```typescript
import { Raiden } from 'raiden-ts';

# async factory
const raiden = await Raiden.create(web3.currentProvider, 0, localStorage);
```

The async factory is required since a lot of the initialization code is asynchronous. You can always create the instances and fill the constructor parameters yourself, just be aware to persist and rehydrate the state and constants correctly.

When done you can call `raiden.stop()` to trigger for all observables to complete and for the streams to be unsubscribed. This is not required however since state changes are atomic (non-async) and Raiden can be rehydrated from any intermediary state.

If you happen to finish before an asynchronous operation was completed you might need to re-send it. For example if you call `raiden.closeChannel` and your app exits before the transaction was sent and the promise resolved. In such case your channel will be left in the `closing` state and you might need to call `closeChannel` again to actually send the transaction and wait until it is mined and your channel actually gets `closed`.

Most of the methods in the public API for your `raiden` instance returns Promises and allows you to async/await on them. The output comes either from the resolved value or public Observables.