<!-- PROJECT SHIELDS -->

<!-- Gitter Badge -->
<!-- CI-Status Badge -->

<h2 align="center">
  <br/>
  <a href='https://raiden.network/'><img 
      width='400px' 
      alt='' 
      src="https://user-images.githubusercontent.com/35398162/54018436-ee3f6300-4188-11e9-9b4e-0666c44cda53.png" /></a>
  <br/>
  Raiden Light Client SDK and Wallet
  <br/>
</h2>

<h4 align="center">
  A JavaScript SDK and wallet to make fast, cheap, scalable token transfers with other <a href="https://github.com/raiden-network/raiden">Raiden Clients</a>.
</h4>

<p align="center">
  <a href="#getting-started">Getting Started</a> ∙
  <a href="#license">License</a> ∙
  <a href='#contact'>Contact</a>
</p>

<p align="center">
  <a href="https://gitter.im/raiden-network/raiden">
    <img src="https://badges.gitter.im/gitterHQ/gitter.png" alt="Gitter Raiden Badge">
  </a> 
</p>

The Raiden Light Client SDK is a [Raiden Network](https://raiden.network) compatible client written on JavaScript/Typescript, capable of running in modern web3-enabled browsers, wallets and Node.js environments.

The [Raiden Wallet](#example-wallet) is a reference implementation of the Raiden Light Client SDK, which can be used with web3 wallets like Metamask (Desktop) or imWallet (mobile).

## About The Project

The [Raiden Network](https://raiden.network/) is an off-chain scaling solution, enabling near-instant, low-fee and scalable payments. It’s complementary to the Ethereum blockchain and works with any ERC20 compatible token.

There is already a [Raiden client](https://github.com/raiden-network/raiden) available, which has been [released for mainnet in December 2018](https://medium.com/raiden-network/red-eyes-mainnet-release-announcement-d48235bbef3c).

However, we want to create an easy to use SDK, which can be integrated by any JavaScript developer to make it easier to send tokens through the Raiden Network.

Here's why
* You should be able to interact with the Raiden Network easily with your dApp.
* We want you to be enable your users to make token transfers using their consumer wallets like imToken or Metamask.
* It should be possible to send tokens using low end devices.

## Built With
To build a solid architecture we have are using the following main frameworks:
* [TypeScript](https://www.typescriptlang.org/)
* [Redux](https://redux.js.org/)
* [Vue.js](https://vuejs.org/)

## Architecture

### Raiden Light Client SDK

This is a standalone Typescript library which contains all the low level machinery to interact with the Ethereum blockchain and Raiden Network.

Its target audience is blockchain and dApp developers looking into interacting with and performing payments through the Raiden Network from their apps. Targeting browsers and Node.js as initial platforms allows it to reach the majority of current and in-development dApps, as well as to work as a common language reference implementation for ports and re-implementations in other future languages and environments.

The main entry point of the SDK is the `Raiden` class, which exposes an `async`/promise-based public API to fetch state, events and perform every action provided by the SDK on the blockchain and Raiden Network.

Internally, the SDK architecture is a Redux-powered state machine, where every blockchain event, user request and off-chain message from other Raiden nodes and service providers follows an unified flow as actions on this state machine. These actions produce deterministic changes to the state and may cause other actions to be emitted as well. Asynchronous operations are handled by a pipeline of [redux-observable](https://redux-observable.js.org) epics, an [RxJs](https://rxjs.dev/) async extension for Redux which unleashes the power, versatility and correctness of observables to Redux actions processing. These epics interact with the blockchain through [ethers.js](https://github.com/ethers-io/ethers.js) providers, signers and contracts, allowing seamless integration with different web3 providers, such as [Metamask](https://metamask.io/). Redux state is optionally persisted on `localStorage` or emitted to be persisted somewhere else. Tests are implemented with [Jest](https://jestjs.io).

External off-chain communication with the Raiden Network is provided by a dedicated federation of community-provided [matrix.org](https://matrix.org) homeservers, accessed through [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk).

### Raiden Wallet

The Raiden Wallet is the demo and first dApp user of the SDK. It's a wallet-like web single page application (SPA) built on top of [Vue.js](https://vuejs.org/), [vuex](https://vuex.vuejs.org) and [vuetify](https://vuetifyjs.com) as UI framework which uses Material Design as the design guideline.

### Architecture diagram

```
            +-------------------+
            |                   |
            |   Raiden Wallet   |
            |                   |
            |  vue/vuex/vuetify |
            |                   |
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

## Getting Started

### Learn about Raiden

If you haven't used Raiden yet, you can
* Look at the [documentation](https://raiden-network.readthedocs.io/en/stable/index.html)
* Learn about it watching [Youtube videos](https://www.youtube.com/channel/UCoUP_hnjUddEvbxmtNCcApg)
* Read the posts on [Medium](https://medium.com/@raiden_network)

### Prerequisites

To run the code in this repository, you must have Node.js 10+ on your computer and a web3-enabled browser (e.g. Firefox with Metamask extension), as well as some ETH on the account.

### SDK Installation

```
npm install <raiden_npm_package>
```
Then in your JavaScript or TypeScript project:

```typescript
import { Raiden } from 'raiden';

# async factory
const raiden = await Raiden.create(web3.currentProvider, 0, localStorage);

# subscribe to channels$ observable
raiden.channels$.subscribe((channels) => console.log('# raiden channels:', channels));

# open a Raiden payment channel!
const openTxHash = await raiden.openChannel('0xtoken', '0xpartner');

# output:
# {
#   '0xtoken': {
#     '0xpartner': {
#       state: 'open',
#       totalDeposit: BigNumber(0),
#       partnerDeposit: BigNumber(0),
#       id: 123,
#       settleTimeout: 500,
#       openBlock: 5123
#     }
#   }
# }
```

### Wallet Installation

```bash
git clone https://github.com/raiden-network/light-client.git
cd light-client/raiden-wallet
```

In order to use the wallet you first have to run `sync-sdk.sh`, which is located in the `raiden-wallet` directory.
The script builds the sdk and syncs the module with the `node_modules` of the wallet application. And installs the
required dependencies.

```bash
./sync-sdk.sh
```

 If for you have problems executing the script you to follow the setup manually.

 #### Build the Raiden SDK

 First you need to build the sdk. For this you have to go to the `raiden` directory and run the following commands.

```bash
cd ../raiden
npm install
npm run build
```

#### Install the Wallet Dependencies

Then you need to install the wallet app dependencies.

```bash
cd ../raiden-wallet
npm install
```

This will also create a symbolic link in `raiden-wallet/node_modules/raiden` to `raiden`.

Due to the way webpack loads it's module dependencies this will not work, so another setup is required.
You have to delete the symbolic link and copy the contents of `raiden` to `raiden-wallet/node_modules/raiden`.

```bash
rm -rf ./node_modules/raiden
rsync --stats -aAvX ../raiden/* node_modules/raiden
```

#### Running the Wallet

To start the development server you have to run the following command.

```bash
npm run serve
```

After the development server starts you have to navigate to `http://localhost:8080`, in order to use the
Raiden Wallet. The wallet application requires either MetaMask to be installed on your browser or some other
web3 provider (e.g. Wallet apps with dApp support).

## Contributing

Contributions are what make the open source community such an amazing place to be learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the [MIT License](./LICENSE).

## Contact

Dev Chat: [Gitter](https://gitter.im/raiden-network/raiden)

Twitter: [@raiden_network](https://twitter.com/raiden_network)

Website: [Raiden Network](https://raiden.network/)

Mail: contact@raiden.network 

Project Link: [https://github.com/raiden-network/light-client](https://github.com/raiden-network/light-client)

<!-- ACKNOWLEDGEMENTS -->
## Acknowledgements

This project wouldn't be possible without the help from:
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)
* [web3studio-sojourn README](https://github.com/ConsenSys/web3studio-sojourn)
