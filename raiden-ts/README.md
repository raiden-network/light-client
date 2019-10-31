<h2 align="center">
  <br/>
  <a href='https://raiden.network/'><img
      width='400px'
      alt=''
      src="https://user-images.githubusercontent.com/35398162/54018436-ee3f6300-4188-11e9-9b4e-0666c44cda53.png" /></a>
  <br/>
  Raiden Light Client SDK
  <br/>
</h2>
<h4 align="center">
  <a href="https://lightclient.raiden.network/docs/">Full documentation</a>
</h4>

The Raiden Light Client SDK is a [Raiden Network](https://raiden.network) compatible client written in JavaScript/Typescript, capable of running in modern web3-enabled browsers, wallets and Node.js environments.

> **INFO:** The Light Client SDK is **work in progress**, doesn't work for token transfers yet and currently can only be used on the Ethereum **Testnets**.

## Table of Contents
- [About The Project](#about-the-project)
- [Getting Started](#getting-started)
  * [Connecting to a Raiden test network](#connecting-to-a-raiden-test-network)
  * [Using the SDK in a private chain or a development environment](#using-the-sdk-in-a-private-chain-or-a-development-environment)
  * [Subscribing to channel$ observable and opening your first channel](#subscribing-to-channel-observable-and-opening-your-first-channel)
  * [Funding a channel](#funding-a-channel)
  * [Paying through a channel](#paying-through-a-channel)
  * [Closing a channel](#closing-a-channel)
  * [Settling a channel](#settling-a-channel)
  * [Other methods](#other-methods)
- [Contributing](#contributing)
- [License](#license)

## About The Project

The [Raiden Network](https://raiden.network/) is an off-chain scaling solution, enabling near-instant, low-fee and scalable payments. It’s complementary to the Ethereum blockchain and works with any ERC20 compatible token.

The Raiden client code is available [here](https://github.com/raiden-network/raiden) and has been [released for mainnet](https://medium.com/raiden-network/red-eyes-mainnet-release-announcement-d48235bbef3c) with a limited alpha release of the Raiden Network in December 2018.

The main entry point of the SDK is the `Raiden` class, which exposes an `async`/promise-based public API to fetch state, events and perform every action provided by the SDK on the blockchain and the Raiden Network.

Internally, the SDK architecture is a Redux-powered state machine, where every blockchain event, user request and off-chain message from other Raiden nodes and service providers follows an unified flow as actions on this state machine. These actions produce deterministic changes to the state and may cause other actions to be emitted as well. Asynchronous operations are handled by a pipeline of [redux-observable](https://redux-observable.js.org) epics, an [RxJs](https://rxjs.dev/) async extension for Redux which unleashes the power, versatility and correctness of observables to Redux actions processing. These epics interact with the blockchain through [ethers.js](https://github.com/ethers-io/ethers.js) providers, signers and contracts, allowing seamless integration with different web3 providers, such as [Metamask](https://metamask.io/). Redux state is optionally persisted on `localStorage` or emitted to be persisted somewhere else. Tests are implemented with [Jest](https://jestjs.io).

External off-chain communication with the Raiden Network is provided by a dedicated federation of community-provided [matrix.org](https://matrix.org) homeservers, accessed through [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk).

### Architecture diagram

```
            +---------+---------+
            |                   |
            |    Raiden SDK     |
            |                   |
            +----+----+----+----+
            |         |         |      +------------+
         +--+  redux  +  epics  +------+ Matrix.org |
         |  |         |         |      +-----+------+
         |  +---------+-----+---+            |
         |                  |          +-----+------+
+--------+-------+   +------+------+   |   Raiden   |
|  localStorage  |   |  ethers.js  |   |   Network  |
+----------------+   +------+------+   +------------+
                            |
                     +------+------+
                     |  ethereum   |
                     +-------------+
```

A technical deep dive into the SDK architecture, technologies, tips and details on the design goals and decisions can be found in the [project's Wiki page](https://github.com/raiden-network/light-client/wiki/SDK-Development). Reading it is highly recommended to anyone wishing to better understand how the Raiden Light Client works under the hood or to contribute to it, though not required to use this library as a dApp developer.

## Getting Started

Go to the [full documentation including this readme and the documentation of the SDK classes, enums and interfaces.](https://lightclient.raiden.network/docs/#getting-started)

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

### Connecting to a Raiden test network

Connecting to a Raiden test network is automatically done by the Light Client SDK. The SDK will automatically connect to the proper Raiden network based on the detected network id on your web3 provider.

The SDK provides out of the box support for the deployed networks on Ropsten, Rinkeby, and Mainnet.

If you want you can also use the Light Client SDK to connect to networks that are not officially supported.

To connect for example on a privately deployed Raiden network,
you can initialize the SDK as usual, and pass the Contract Info as the fourth parameter of the create function.

```typescript
import { Raiden } from 'raiden-ts';

# async factory
const raiden = await Raiden.create(web3.currentProvider, 0, localStorage, contractInfo);
```

Contract info is a JSON file that is generated when you deploy [raiden-contracts](https://github.com/raiden-network/raiden-contracts).

### Using the SDK in a private chain or a development environment

If you want to use the SDK in a private chain or a development environment, you can follow [this guide](https://github.com/raiden-network/light-client/wiki/Using-the-SDK-in-a-private-chain-or-a-development-environment).

### Subscribing to channel$ observable and opening your first channel

To connect to the Raiden Network, you simply make a transaction to open a channel on-chain with a given partner on a registered token network. You can also specify a `settleTimeout`, which will be the number of blocks you and your partner will need to wait after closing a channel to be able to settle it and actually get the due tokens back. `settleTimeout` defaults to `500`

```
import { RaidenChannel } from 'raiden-ts';

# logs channels$ changes
raiden.channels$.subscribe(
  (channels: { [token: string]: { [partner: string]: RaidenChannel } }) =>
    console.log('Raiden channels:', channels)
);

# get list of registered tokens
await raiden.getTokenList();
# ['0xtoken']

# open a Raiden payment channel!
const openTxHash = await raiden.openChannel('0xtoken', '0xpartner');

## output:
# Raiden channels: {
#   '0xtoken': {
#     '0xpartner': {
#       token: '0xtoken',
#       tokenNetwork: '0xtokenNetwork',
#       partner: '0xpartner',
#       state: 'open',
#       ownDeposit: BigNumber(0),
#       partnerDeposit: BigNumber(0),
#       id: 123,
#       settleTimeout: 500,
#       openBlock: 5123,
#       balance: BigNumber(0),
#       capacity: BigNumber(0),
#     }
#   }
# }
```

### Funding a channel

If you intend to perform payments via a channel, you need to first lock a given amount of tokens in it. Note that these tokens aren't paid yet to the partner, and the custody is fully yours. It just locks this amount on-chain so your partner can be sure a given payment can be claimed.

```typescript
raiden.depositChannel('0xtoken', '0xpartner', 100);

# Raiden channels: {
#   '0xtoken': {
#     '0xpartner': {
#       token: '0xtoken',
#       tokenNetwork: '0xtokenNetwork',
#       partner: '0xpartner',
#       state: 'closed',
#       ownDeposit: BigNumber(100),
#       partnerDeposit: BigNumber(0),
#       id: 123,
#       settleTimeout: 500,
#       openBlock: 5123
#       balance: BigNumber(0), // total received minus sent
#       capacity: BigNumber(100), // current spendable amount on channel
#     }
#   }
# }
```

### Paying through a channel

This is where the fun begins: off-chain payments!

The main point of information about past and pending transfers is the `transfers$: Observable<RaidenSentTransfer>` observable. It'll first emit all known past transfers at subscription time (history), then emit again each time a transfer state changes, allowing you to keep track of the transfer status. The [Raiden.transfer](https://github.com/raiden-network/light-client/blob/dfe87e1886b12fc9f85857b01e28db5e81cc5070/raiden-ts/src/raiden.ts#L693) method is used to initiate an outgoing transfer, and returned Promise will reject with an Error if transfer signature prompt is cancelled or resolve with the `secrethash` value (a transfer unique key) as soon as it's registered. You can use this `secrethash` property of the objects emitted by `transfers$` as a unique key to keep track of specific transfers.

```typescript
import { RaidenSentTransfer } from 'raiden-ts';

const transfers: { [secrethash: string]: RaidenSentTransfer } = {};
raiden.transfers$.subscribe(transfer => {
  transfers[transfer.secrethash] = transfer;
  console.log('Transfers updated:', transfers);
});
const secrethash: string = await raiden.transfer('0xtoken', '0xtarget', 10);

## channels$ output, as balance & capacity are updated:
# Raiden channels: {
#   '0xtoken': {
#     '0xpartner': {
#       token: '0xtoken',
#       tokenNetwork: '0xtokenNetwork',
#       partner: '0xpartner',
#       state: 'open',
#       ownDeposit: BigNumber(100),
#       partnerDeposit: BigNumber(0),
#       id: 123,
#       settleTimeout: 500,
#       openBlock: 5123
#       balance: BigNumber(-10), // you spent 10 tokens
#       capacity: BigNumber(90), // capacity is reduced as well
#     }
#   }
# }

## transfers$ output:
# Transfers updated: {
#   [secrethash]: {
#     secrethash,
#     status: 'PENDING', // see RaidenSentTransferStatus enum imported from 'raiden-ts'
#     initiator: '0xourAddress'
#     recipient: '0xpartner',
#     target: '0xtarget',
#     paymentId: BigNumber(99123), // auto-generated if not passed as `opts.paymentId` to transfer
#     chainId, // channel info
#     token: '0xtoken',
#     tokenNetwork: '0xtokenNetwork',
#     channelId: 123,
#     amount: BigNumber(10),
#     expirationBlock: 5223,
#     fee: BigNumber(0),
#     startedAt: new Date(1566929562387),
#     changedAt: new Date(1566929562387),
#     success: undefined, // set as soon as known if transfer was revealed or failed
#     completed: false, // true after no more actions are pending for this transfer
#   }
# }

```


### Closing a channel

Only close a channel if you really don't plan on using the respective channel anymore.

```typescript
await raiden.closeChannel('0xtoken', '0xpartner')
# resolves to close transaction hash, after it is mined

## channels$ output:
# Raiden channels: {
#   '0xtoken': {
#     '0xpartner': {
#       token: '0xtoken',
#       tokenNetwork: '0xtokenNetwork',
#       partner: '0xpartner',
#       state: 'closed',
#       ownDeposit: BigNumber(100),
#       partnerDeposit: BigNumber(0),
#       id: 123,
#       settleTimeout: 500,
#       openBlock: 5123
#       closeBlock: 5999,
#       balance: BigNumber(-10),
#       capacity: BigNumber(90),
#     }
#   }
# }
```

### Settling a channel

As we can't perform a cooperative close yet, once your channel is closed, there is a grace period of `settleTimeout` blocks during which the counterpart can claim a higher signed balance proof sent by you. As the Light Client doesn't receive payments yet, there's no need to worry here, only the tokens you paid can be claimed by your partner. After `settleTimeout` blocks, your channel's state automatically becomes `settleable`, which is like `closed` but when settle can be called:

```typescript
await raiden.settleChannel('0xtoken', '0xpartner')
# resolves to settle transaction hash, after it is mined

## channels$ output:
# Raiden channels: {
#   '0xtoken': {}
# }
```

Once channel is settled, it's gone from state, and the cycle can restart.

### Other methods

There's a couple of more public methods exposed through main Raiden Light Client API. It aims to provide all necessary blockchain interaction methods and events related to Raiden, so you don't need to worry about web3 and Raiden contracts directly. Also, we're working on exposing more events and informational methods to the world, so stay tuned and keep an eye out for the main public API file: [raiden.ts](./src/raiden.ts). It's very easy to understand and docstrings are all over the place.

## Contributing

Any contributions you make are **greatly appreciated**. Refer to the [Raiden Light Client Development Guide](../CONTRIBUTING.md) for details on how to comply with our codestyle, patterns and quality requirements.

## License

Distributed under the [MIT License](../LICENSE).
