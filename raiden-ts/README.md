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

> **INFO:** The Light Client SDK, CLI and dApp are all **work in progress** projects. All three projects have been released for mainnet and all code is available in the [Light Client repository](https://github.com/raiden-network/light-client). As this release still has its limitations and is a beta release, it is crucial to read this readme including the security notes carefully before using the software.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [About The Project](#about-the-project)
  - [Architecture diagram](#architecture-diagram)
- [Requirements for Safe Usage](#requirements-for-safe-usage)
- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [License](#license)

> Important information for users
> The Raiden Light Client is an application that allows you to interact with the Raiden
> network. If you haven't used Raiden before we recommend that you:
> - [Checkout the developer portal](https://developer.raiden.network)
> - [Look at the documentation](https://docs.raiden.network)
> - [Learn more by watching explanatory videos](https://www.youtube.com/channel/UCoUP_hnjUddEvbxmtNCcApg)
> - [Read the blog posts on Medium](https://medium.com/@raiden_network)
>
> **Terms of Use**
> By accessing the Raiden Light Client through our website you agree to the [Terms of Use](https://github.com/raiden-network/light-client/blob/master/TERMS.md)
> and [Privacy Policy](https://raiden.network/privacy.html).
>
> **Disclaimer**
> The Raiden Light Client is a beta version of experimental open source software released
> as a test version under an MIT license and may contain errors and/or bugs. No guarantee
> or representation whatsoever is made regarding its suitability (or its use) for any purpose
> or regarding its compliance with any applicable laws and regulations. Use of the Raiden
> Light Client is at your own risk and discretion and by using the software you warrant and
> represent that you have read this disclaimer, understand its contents, assume all risk
> related thereto and hereby release, waive, discharge and covenant not to hold us or any of
> our officers, employees or affiliates from and for any direct or indirect damage resulting
> from the Raiden Light Client or the use thereof. Such to the extent as permissible by
> applicable laws and regulations.
>
> **Privacy warning**
> Please be aware, that by using the Raiden Light Client, among others your Ethereum
> address, channels, channel deposits, settlements and the Ethereum address of your
> channel counterparty will be stored on the Ethereum chain, i.e. on servers of Ethereum
> node operators and ergo are to a certain extent publicly available. The same might also be
> stored on systems of parties running Raiden nodes connected to the same token network.
> Data present in the Ethereum chain is very unlikely to be able to be changed, removed or
> deleted from the public arena.
>
> Also be aware, that data on individual Raiden token transfers will be made available via
> the Matrix protocol to the recipient, intermediating nodes of a specific transfer as well as to
> the Matrix server operators, see Raiden Transport Specification.

## About The Project

The [Raiden Network](https://raiden.network/) is an off-chain scaling solution, enabling near-instant, low-fee and scalable payments. It’s complementary to the Ethereum blockchain and works with any ERC20 compatible token.

The Raiden client code is available [here](https://github.com/raiden-network/raiden) and has been [released for mainnet](https://medium.com/raiden-network/alderaan-mainnet-release-announcement-7f701e58c236) in beta state as part of the Alderaan Raiden Network release in May 2020.

The main entry point of the SDK is the `Raiden` class, which exposes an `async`/promise-based public API to fetch state, events and perform every action provided by the SDK on the blockchain and the Raiden Network.

Internally, the SDK architecture is a Redux-powered state machine, where every blockchain event, user request and off-chain message from other Raiden nodes and service providers follows an unified flow as actions on this state machine. These actions produce deterministic changes to the state and may cause other actions to be emitted as well. Asynchronous operations are handled by a pipeline of [redux-observable](https://redux-observable.js.org) epics, an [RxJs](https://rxjs.dev/) async extension for Redux which unleashes the power, versatility and correctness of observables to Redux actions processing. These epics interact with the blockchain through [ethers.js](https://github.com/ethers-io/ethers.js) providers, signers and contracts, allowing seamless integration with different web3 providers, such as [Metamask](https://metamask.io/). Redux state is persisted using [PouchDB](https://pouchdb.com/), with `indexedDB` as backend on browsers, if you use the `raiden-dapp`, or `LevelDown` if used with `raiden-cli` on NodeJS. Tests are implemented with [Jest](https://jestjs.io).

External off-chain communication with the Raiden Network is provided by a dedicated federation of community-provided [matrix.org](https://matrix.org) homeservers, accessed through [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk), and [WebRTC](https://webrtc.org/) for fast p2p communication.

### Architecture diagram

```
            +---------+---------+
            |                   |
            |    Raiden SDK     |
            |                   |
            +----+----+----+----+
            |         |         |      +--------------+
        +---+  redux  +  epics  +------+ Matrix.org / |
        |   |         |         |      |    WebRTC    |
        |   +---------+-----+---+      +-------+------+
        |                   |                  |
+-------+--------+   +------+------+    +------+------+
|    pouchDB     |   |  ethers.js  |    |    Raiden   |
+----------------+   +------+------+    |    Network  |
                            |           +-------------+
                     +------+------+
                     |  ethereum   |
                     +-------------+
```

A technical deep dive into the SDK architecture, technologies, tips and details on the design goals and decisions can be found in the [SDK Development](https://github.com/raiden-network/light-client/blob/master/raiden-ts/SDK-Development.md) document. Reading it is highly recommended to anyone wishing to better understand how the Raiden Light Client works under the hood or to contribute to it, though not required to use this library as a dApp developer.

## Requirements for Safe Usage

- **Layer 1 works reliably:** That means that you have got a web3 provider (eg. MetaMask) that is always synced and working reliably. If there are any problems or bugs on the client then Raiden can not work reliably.

- **Persistency of local DB:** Your local state database is stored in your IndexedDB storage on browser environments, and local LevelDown database folder on NodeJS environments. This data should not be deleted by the user or tampered with in any way. Frequent backups are also recommended. Deleting this storage could mean losing funds.

- **Raiden account has sufficient ETH:** It is your job as the user to ensure your account has enough ETH at all times when some on-chain transactions needs to be performed. Most of those are on-demand/interactive, but some may be required as a reaction to some non-interactive event (e.g. registering the secret for a received but not unlocked transfer).

## Getting Started

Go to the [full documentation including this readme and the documentation of the SDK classes, enums and interfaces.](https://lightclient.raiden.network/docs/installing-sdk/) to learn how to install and use the Light Client SDK.

## Contributing

Any contributions you make are **greatly appreciated**. Refer to the [Raiden Light Client Development Guide](../CONTRIBUTING.md) for details on how to comply with our codestyle, patterns and quality requirements.

## License

Distributed under the [MIT License](../LICENSE).
