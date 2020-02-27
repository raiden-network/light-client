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

The Raiden Light Client SDK is a [Raiden Network](https://raiden.network) compatible client written in JavaScript/Typescript, capable of running in modern web3-enabled browsers, wallets and Node.js environments.

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

A technical deep dive into the SDK architecture, technologies, tips and details on the design goals and decisions can be found in the [SDK Development](https://github.com/raiden-network/light-client/blob/master/raiden-ts/SDK-Development.md) document. Reading it is highly recommended to anyone wishing to better understand how the Raiden Light Client works under the hood or to contribute to it, though not required to use this library as a dApp developer.