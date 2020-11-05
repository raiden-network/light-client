<!-- PROJECT SHIELDS -->

<h2 align="center">
  <br/>
  <a href='https://raiden.network/'><img 
      width='400px' 
      alt='' 
      src="https://user-images.githubusercontent.com/35398162/54018436-ee3f6300-4188-11e9-9b4e-0666c44cda53.png" /></a>
  <br/>
  Raiden Light Client SDK, CLI and dApp
  <br/>
</h2>

<h4 align="center">
  JavaScript SDK, CLI and dApp to carry out fast, cheap, scalable off-chain token transfers with other <a href="https://github.com/raiden-network/raiden">Raiden Clients</a>.
</h4>

<p align="center">
  <a href="#getting-started">Getting Started</a> ∙
  <a href="#contact">Contact</a>
</p>

<p align="center">
  <a href="#try-out-the-raiden-demo-dapp">Try Out the Raiden Demo dApp</a>
</p>

<p align="center">
  <a href="https://circleci.com/gh/raiden-network/light-client">
   <img src="https://circleci.com/gh/raiden-network/light-client.svg?style=svg&circle-token=2586ec4e7d610d2a114e4a833fa44ef6c00d9e97" alt="CircleCI Badge">
  </a>
  <a href="https://codecov.io/gh/raiden-network/light-client">
    <img src="https://codecov.io/gh/raiden-network/light-client/branch/master/graph/badge.svg?token=QzmREKozOH" alt="Codecov Badge">
  </a>
  <a href="https://codeclimate.com/github/raiden-network/light-client/maintainability">
    <img src="https://api.codeclimate.com/v1/badges/d59cce05c229296c848d/maintainability" />
  </a>
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square" alt="code style: prettier">
  </a>
  <a href="https://gitter.im/raiden-network/raiden">
    <img src="https://badges.gitter.im/gitterHQ/gitter.png" alt="Gitter Raiden Badge">
  </a>
</p>

The Raiden Light Client SDK is a [Raiden Network](https://raiden.network) compatible client written in JavaScript/Typescript, capable of running in modern web3-enabled browsers, wallets and Node.js environments.

The Raiden CLI is a reference implementation which provides a HTTP REST server that is fully compatible with the [Raiden API specification](https://docs.raiden.network/raiden-api-1/resources).

The [Raiden dApp](#raiden-dapp) is a reference implementation of the Raiden Light Client SDK, which can be used with web3 wallets like [Metamask](https://metamask.io/) (Desktop) or [imToken](https://token.im/download) (mobile).

> **INFO:** The Light Client SDK, CLI and dApp are all **work in progress** projects.

## Table of Contents

- [About the Project](#about-the-project)
- [Architecture](#architecture)
  - [Raiden Light Client SDK](#raiden-light-client-sdk)
  - [Architecture diagram](#architecture-diagram)
- [Getting Started](#getting-started)
  - [Learn about Raiden](#learn-about-raiden)
- [Try Out the Raiden Demo dApp](#try-out-the-raiden-demo-dapp)
  - [Prerequisites](#prerequisites)
  - [Steps to Make Your First Transfer](#steps-to-make-your-first-transfer)
  - [Backup the State to Keep Your Tokens](#backup-the-state-to-keep-your-tokens)
- [Run Repository Code](#run-repository-code)
  - [Prerequisites](#prerequisites)
  - [SDK Documentation](#sdk-documentation)
  - [CLI Documentation](#cli-documentation)
  - [Install and Run dApp](#install-and-run-dapp)
- [Roadmap and Timeline](#roadmap-and-timeline)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## About The Project

The [Raiden Network](https://raiden.network/) is an off-chain scaling solution, enabling near-instant, low-fee and scalable payments. It’s complementary to the Ethereum blockchain and works with any ERC20 compatible token.

The Raiden client code is available [here](https://github.com/raiden-network/raiden) and has been [released for mainnet](https://medium.com/raiden-network/alderaan-mainnet-release-announcement-7f701e58c236).

<center>
<img 
      width='750px' 
      alt='' 
      src="https://user-images.githubusercontent.com/43838780/85526750-8ecdc680-b60a-11ea-8a42-07da6b0f8296.png" />
</center>

The goal of the Raiden Light Client SDK is to provide an easy-to-use framework, which can be integrated by any JavaScript developer. The SDK will simplify the process of embedding and using the Raiden Network for token transfers in decentralized applications

With the SDK we want to make your life as a dApp developer easier.

- You should be able to interact with the Raiden Network easily with your dApp.
- We want to help you to enable your users to make token transfers using consumer wallets like imToken or MetaMask.
- You should be able to transfer and receive tokens using low-end devices.

## Architecture

### [Raiden Light Client SDK](./raiden-ts/README.md)

This is a standalone Typescript library which contains all the low level machinery to interact with the Ethereum blockchain and the Raiden Network.

Its target audience is blockchain and dApp developers looking to perform transfers in the Raiden Network from their dApps. Targeting browsers and Node.js as initial platforms allows the SDK to reach a majority of the current and in-development dApps, as well as to work as a common language reference implementation for ports and re-implementations in other languages and environments.

Look at the [Raiden Light Client SDK folder of this repository](./raiden-ts/README.md) for more information and a technical deep dive into the SDK architecture, technologies, tips and details on the design goals and decisions. Reading it is highly recommended to anyone wishing to better understand how the Raiden Light Client works under the hood or to contribute to it, though not required to use this library as a dApp developer.

### Architecture diagram

```
            +-------------------+
            |                   |
            |   Raiden dApp     |
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

If you haven't used Raiden before we recommend that you:

- Checkout the [developer portal](http://developer.raiden.network)
- Look at the [documentation](https://docs.raiden.network/)
- Learn more by watching explanatory [videos](https://www.youtube.com/channel/UCoUP_hnjUddEvbxmtNCcApg)
- Read our blog posts on [Medium](https://medium.com/@raiden_network)

## Try Out the Raiden Demo dApp

The Raiden dApp is a demo and the first dApp to use SDK. It's a single page application (SPA) built on top of [Vue.js](https://vuejs.org/), [vuex](https://vuex.vuejs.org) and uses [vuetify](https://vuetifyjs.com) Material Design as UI framework.

These step-by-step instructions will guide you through the process for trying out the Raiden demo dApp. The dApp is hosted at [https://lightclient.raiden.network/](https://lightclient.raiden.network/) and we will be using the Goerli testnet and MetaMask wallet in this example.

### Prerequisites

You need to have MetaMask installed for your browser. If you don't have MetaMask, [visit their website](https://metamask.io/) to download and install it.

### Steps to Make Your First Transfer

#### 1. Acquire ETH

1. Go to the Goerli faucet at [htts://faucet.goerli.mudit.blog](https://faucet.goerli.mudit.blog) or [https://goerli-faucet.slock.it/](https://goerli-faucet.slock.it/)
2. Follow the instructions on how to acquire Goerli ETH on respective website

#### 2. Navigate to the Raiden Hub

1. Visit the Raiden Hub Page at [https://hub.raiden.network/](https://hub.raiden.network/)
2. Click **Open Channel with Hub** to get forwarded to [https://lightclient.raiden.network/](https://lightclient.raiden.network/)

#### 3. Connect to the Raiden dApp

1. Click **Connect** to connect the dApp to your MetaMask

#### 4. Select a Hub and Open a Channel

1. Click on the symbol next to the **SVT** balance to mint and deposit testnet utility tokens.
2. Click the mint button next to your token balance, to mint some TTT tokens.
3. Click **Select Hub**
4. Enter the amount of TTT Tokens you want to deposit when opening a channel with the hub
5. Click **Open Channel** and sign with MetaMask.

#### 5. Make a transfer

1. Enter the address of the node receiving your transfer (eg. `hub.raiden.network`)
2. Enter the amount you want to transfer
3. Click **Transfer**

### Backup the State to Keep Your Tokens

Store a backup of your state to **avoid loosing tokens** in case you:

- Delete your local browser storage
- Change your computer
- Change your browser

If you want to continue using the dApp with a specific account when switching browser or changing computer you need to make sure that the dApp is connecting with the most recent state.

This is important because your state contains all the off-chain information which is needed to make transactions in the Raiden Network. Your state is stored in the browser across sessions and therefore it needs to be downloaded and uploaded whenever you switch browser or change computer.

You can download and upload your state via the `General Menu`. Note that if you loose or delete your state you will also loose your tokens.

Example structure of beginning of the state file JSON:

```json
[
  {
    "_id": "_meta",
    "version": 2,
    "network": 5,
    "registry": "0x9b0c8C8C75904CEf5B7a8dbF59c3459Ea85c6526",
    "address": "0x2a23F385d32dcce35824D4498Bb10f9B6575B2de",
    "blockNumber": 2561973
  }
]
```

## Run Repository Code

### Prerequisites

To run the code in this repository, you must have Node.js 14+ and Yarn installed as well as a web3-enabled browser (e.g. Firefox with Metamask extension), with some ETH on the account.

### SDK Documentation

Go to the [SDK Documentation](https://lightclient.raiden.network/docs/) for more information on how to install and use the SDK.

### CLI Documentation

Go to the [CLI README](https://github.com/raiden-network/light-client/tree/master/raiden-cli) for installation instructions and the current status of the API.

### Install and Run dApp

1. Clone repository  

   ```bash
   git clone --recurse-submodules https://github.com/raiden-network/light-client.git
   cd light-client
   ```

2. Install dependencies  

   ```bash
   yarn install
   ```

3. Build the Raiden SDK  

   ```bash
   yarn workspace raiden-ts build
   ```

4. Run the dApp locally  

   ```
   yarn workspace raiden-dapp serve
   ```

   After the development server starts you have to navigate to `http://localhost:8080`, in order to use the Raiden dApp.

## Roadmap and Timeline

We are working in [2 weekly iterations](https://github.com/raiden-network/light-client/projects). Priorities are managed within the [Product Backlog](https://github.com/raiden-network/light-client/milestone/1).

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
