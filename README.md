<!-- PROJECT SHIELDS -->

<h2 align="center">
  <br/>
  <a href='https://raiden.network/'><img 
      width='400px' 
      alt='' 
      src="https://user-images.githubusercontent.com/35398162/54018436-ee3f6300-4188-11e9-9b4e-0666c44cda53.png" /></a>
  <br/>
  Raiden Light Client SDK and dApp
  <br/>
</h2>

<h4 align="center">
  JavaScript SDK and dApp to carry out fast, cheap, scalable off-chain token transfers with other <a href="https://github.com/raiden-network/raiden">Raiden Clients</a>.
</h4>

<p align="center">
  <a href="#getting-started">Getting Started</a> ∙
  <a href='#contact'>Contact</a>
</p>

<p align="center">
  <a href="https://circleci.com/gh/raiden-network/light-client">
   <img src="https://circleci.com/gh/raiden-network/light-client.svg?style=svg&circle-token=2586ec4e7d610d2a114e4a833fa44ef6c00d9e97" alt="CircleCI Badge">
  </a>
  <a href="https://codecov.io/gh/raiden-network/light-client">
    <img src="https://codecov.io/gh/raiden-network/light-client/branch/master/graph/badge.svg?token=QzmREKozOH" alt="Codecov Badge">
  </a>
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square" alt="code style: prettier">
  </a>
  <a href="https://gitter.im/raiden-network/raiden">
    <img src="https://badges.gitter.im/gitterHQ/gitter.png" alt="Gitter Raiden Badge">
  </a>
</p>

The Raiden Light Client SDK is a [Raiden Network](https://raiden.network) compatible client written in JavaScript/Typescript, capable of running in modern web3-enabled browsers, wallets and Node.js environments.

The [Raiden dApp](#example-dApp) is a reference implementation of the Raiden Light Client SDK, which can be used with web3 wallets like [Metamask](https://metamask.io/) (Desktop) or [imToken](https://token.im/download) (mobile).

> **INFO:** The Light Client SDK and dApp are work in progress and currently cannot be used to make token transfers on the Ethereum Mainnet.

## Table of Contents
- [About The Project](#about-the-project)
- [Architecture](#architecture)
  * [Raiden Light Client SDK](#raiden-light-client-sdk)
  * [Raiden dApp](#raiden-dapp)
  * [Architecture diagram](#architecture-diagram)
- [Getting Started](#getting-started)
  * [Learn about Raiden](#learn-about-raiden)
  * [Prerequisites](#prerequisites)
  * [SDK Installation](#sdk-installation)
  * [dApp Installation](#dapp-installation)
    + [Build the Raiden SDK](#build-the-raiden-sdk)
    + [Install the dApp Dependencies](#install-the-dapp-dependencies)
    + [Running the dApp locally](#running-the-dapp-locally)
- [Roadmap and Timeline](#roadmap-and-timeline)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## About The Project

The [Raiden Network](https://raiden.network/) is an off-chain scaling solution, enabling near-instant, low-fee and scalable payments. It’s complementary to the Ethereum blockchain and works with any ERC20 compatible token.

The Raiden client code is available [here](https://github.com/raiden-network/raiden) and has been [released for mainnet](https://medium.com/raiden-network/red-eyes-mainnet-release-announcement-d48235bbef3c) with a limited alpha release of the Raiden Network in December 2018.

The goal of the Raiden Light Client SDK is to provide an easy-to-use framework, which can be integrated by any JavaScript developer. The SDK will simplify the process of embedding and using the Raiden Network for token transfers in decentralized applications

With the SDK we want to make your life as a dApp dev easier:

* You should be able to interact with the Raiden Network easily with your dApp.
* We want to help you to enable your users to make token transfers using their consumer wallets like imToken or Metamask.
* It should be possible to send tokens using low end devices, which would not be capable of running a full Raiden node.

## Architecture

### [Raiden Light Client SDK](./raiden/README.md)

This is a standalone Typescript library which contains all the low level machinery to interact with the Ethereum blockchain and the Raiden Network.

Its target audience is blockchain and dApp developers looking into interacting with and performing payments through the Raiden Network from their apps. Targeting browsers and Node.js as initial platforms allows it to reach the majority of current and in-development dApps, as well as to work as a common language reference implementation for ports and re-implementations in other future languages and environments.

Look at the [Raiden Light Client SDK folder of this repository](./raiden/README.md) for more information.

### Raiden dApp

The Raiden dApp is the demo and first dApp user of the SDK. It's a single page application (SPA) built on top of [Vue.js](https://vuejs.org/), [vuex](https://vuex.vuejs.org) and [vuetify](https://vuetifyjs.com) as UI framework which uses Material Design as the design guideline.

### Architecture diagram

```
            +-------------------+
            |                   |
            |   Raiden dApp   |
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

If you didn't use Raiden before, you can

* Checkout the [developer portal](http://developer.raiden.network)
* Look at the [documentation](https://raiden-network.readthedocs.io/en/stable/index.html)
* Learn more by watching explanatory [videos](https://www.youtube.com/channel/UCoUP_hnjUddEvbxmtNCcApg)
* Read the blog posts on [Medium](https://medium.com/@raiden_network)

### Prerequisites

To run the code in this repository, you must have Node.js 10+ on your computer and a web3-enabled browser (e.g. Firefox with Metamask extension), as well as some ETH on the account.

### SDK Installation

```bash
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

You can find more detailed information on how to use the SDK in the [Raiden Light Client SDK folder of this repository](./raiden/README.md).

### dApp Installation

```bash
git clone https://github.com/raiden-network/light-client.git
cd light-client/raiden-dapp
```

In order to use the dApp you first have to run `sync-sdk.sh`, which is located in the `raiden-dapp` directory. The script builds the sdk and syncs the module with the `node_modules` of the wallet application. And installs the required dependencies.

```bash
./sync-sdk.sh
```

If you have problems executing the script we recommend you to follow the setup manually.

#### Build the Raiden SDK

 First you need to build the sdk. For this you have to go to the `raiden` directory and run the following commands.

```bash
cd ../raiden
npm install
npm run build
```

#### Install the dApp Dependencies

Then you need to install the wallet app dependencies.

```bash
cd ../raiden-dapp
npm install
```

This will also create a symbolic link in `raiden-wallet/node_modules/raiden` to `raiden`.

Due to the way webpack loads it's module dependencies this will not work, so another setup is required.
You have to delete the symbolic link and copy the contents of `raiden` to `raiden-wallet/node_modules/raiden`.

```bash
rm -rf ./node_modules/raiden
rsync --stats -aAvX ../raiden/* node_modules/raiden
```

#### Running the dApp locally

To start the development server you have to run the following command.

```bash
npm run serve
```

After the development server starts you have to navigate to `http://localhost:8080`, in order to use the Raiden dApp. It requires either MetaMask to be installed on your browser or some other web3 provider (e.g. Wallet apps with dApp support).

## Roadmap and Timeline
We are working in [2 weekly iterations](https://github.com/raiden-network/light-client/projects). Priorities are managed within the [Product Backlog](https://github.com/raiden-network/light-client/milestone/1). We are currently working towards milestone 0, where the SDK and dApp are able to send payments, but will not be able to receive payments.

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Also have a look at the [Raiden Light Client Development Guide](./CONTRIBUTING.md) for more info.

## License

Distributed under the [MIT License](./LICENSE).

## Contact

Dev Chat: [Gitter](https://gitter.im/raiden-network/raiden)

Twitter: [@raiden_network](https://twitter.com/raiden_network)

Website: [Raiden Network](https://raiden.network/)

Mail: contact@raiden.network 

Project Link: [https://github.com/raiden-network/light-client](https://github.com/raiden-network/light-client)
