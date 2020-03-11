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

The [Raiden dApp](#raiden-dapp) is a reference implementation of the Raiden Light Client SDK, which can be used with web3 wallets like [Metamask](https://metamask.io/) (Desktop) or [imToken](https://token.im/download) (mobile).

> **INFO:** The Light Client SDK and dApp are **work in progress** and can only be used on the Ethereum **Testnets**.

## Table of Contents
- [Table of Contents](#table-of-contents)
- [About The Project](#about-the-project)
- [Architecture](#architecture)
  - [Raiden Light Client SDK](#raiden-light-client-sdk)
  - [Architecture diagram](#architecture-diagram)
- [Getting Started](#getting-started)
  - [Learn about Raiden](#learn-about-raiden)
  - [Try Out the Raiden Demo dApp](#try-out-the-raiden-demo-dapp)
  - [Start Developing](#start-developing)
    - [Prerequisites](#prerequisites)
    - [SDK Documentation](#sdk-documentation)
    - [dApp Installation](#dapp-installation)
      - [Build the Raiden SDK](#build-the-raiden-sdk)
      - [Install the dApp Dependencies](#install-the-dapp-dependencies)
      - [Running the dApp locally](#running-the-dapp-locally)
- [Roadmap and Timeline](#roadmap-and-timeline)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## About The Project

The [Raiden Network](https://raiden.network/) is an off-chain scaling solution, enabling near-instant, low-fee and scalable payments. It’s complementary to the Ethereum blockchain and works with any ERC20 compatible token.

The Raiden client code is available [here](https://github.com/raiden-network/raiden) and has been [released for mainnet](https://medium.com/raiden-network/red-eyes-mainnet-release-announcement-d48235bbef3c) with a limited alpha release of the Raiden Network in December 2018.

<center>
<img 
      width='750px' 
      alt='' 
      src="https://user-images.githubusercontent.com/43838780/67964837-438d2080-fc01-11e9-93a7-c38129b7d566.png" />
</center>

The goal of the Raiden Light Client SDK is to provide an easy-to-use framework, which can be integrated by any JavaScript developer. The SDK will simplify the process of embedding and using the Raiden Network for token transfers in decentralized applications

With the SDK we want to make your life as a dApp dev easier:

* You should be able to interact with the Raiden Network easily with your dApp.
* We want to help you to enable your users to make token transfers using their consumer wallets like imToken or Metamask.
* It should be possible to send tokens using low end devices, which would not be capable of running a full Raiden node.

## Architecture

### [Raiden Light Client SDK](./raiden-ts/README.md)

This is a standalone Typescript library which contains all the low level machinery to interact with the Ethereum blockchain and the Raiden Network.

Its target audience is blockchain and dApp developers looking into interacting with and performing transfers through the Raiden Network from their apps. Targeting browsers and Node.js as initial platforms allows it to reach the majority of current and in-development dApps, as well as to work as a common language reference implementation for ports and re-implementations in other future languages and environments.

Look at the [Raiden Light Client SDK folder of this repository](./raiden-ts/README.md) for more information. Also, a technical deep dive into the SDK architecture, technologies, tips and details on the design goals and decisions can be found in the [project's Wiki page](https://github.com/raiden-network/light-client/wiki/SDK-Development). Reading it is highly recommended to anyone wishing to better understand how the Raiden Light Client works under the hood or to contribute to it, though not required to use this library as a dApp developer.


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

If you didn't use Raiden before, you can

* Checkout the [developer portal](http://developer.raiden.network)
* Look at the [documentation](https://raiden-network.readthedocs.io/en/stable/index.html)
* Learn more by watching explanatory [videos](https://www.youtube.com/channel/UCoUP_hnjUddEvbxmtNCcApg)
* Read the blog posts on [Medium](https://medium.com/@raiden_network)

### Try Out the Raiden Demo dApp

The Raiden dApp is the demo and first dApp user of the SDK. It's a single page application (SPA) built on top of [Vue.js](https://vuejs.org/), [vuex](https://vuex.vuejs.org) and [vuetify](https://vuetifyjs.com) as UI framework which uses Material Design as the design guideline.

These step-by-step instructions will guide you through the process for trying out the Raiden demo dApp. The dApp is hosted at [https://lightclient.raiden.network/](https://lightclient.raiden.network/) and we will be using the Goerli testnet and MetaMask wallet in this example.

__Prerequisites__

1. You need to have MetaMask installed for your browser. If you don't have MetaMask, [visit their website](https://metamask.io/) to download and install it.
2. It is NOT recommended to use the dApp on mobile (but it works).

__Step 1: Acquire ETH__

1. Go to the Goerli faucet at [htts://faucet.goerli.mudit.blog](https://faucet.goerli.mudit.blog) or [https://goerli-faucet.slock.it/](https://goerli-faucet.slock.it/)
2. Follow the instructions on how to acquire Goerli ETH on respective website

__Step 2: Navigate to the Raiden Hub__

1. Visit the Raiden Hub Page at [https://hub.raiden.network/](https://hub.raiden.network/)
2. Click __Open Channel with Hub__ to get forwarded to [https://lightclient.raiden.network/](https://lightclient.raiden.network/)

__Step 3: Connect to the Raiden dApp__
1. Click __Connect__ to connect the dApp to your MetaMask

__Step 4: Select a Hub and Open a Channel__
1. Click the mint button next to your token balance, to mint some ETHCC3 tokens.
2. Click __Select Hub__
3. Enter the amount of TTT Tokens you want to deposit when opening a channel with the hub
4. Sign the deposit with your MetaMask.
5. Click __Open Channel__.
6. Sign "Open Channel", "Approve" and "Set Total Deposit" with your MetaMask when prompted

__Step 5: Make a transfer__

1. Enter the address of the node receiving your transfer (eg. ```hub.raiden.network```)
2. Enter the amount you want to transfer
3. Click __Transfer__

__Optional: Use a Raiden Full Node__

1. Navigate to https://docs.raiden.network/quick-start and follow the instructions
2. [Join the EthCC3 token network](https://docs.raiden.network/using-raiden/the-raiden-web-interface/join-a-token-network)
3. [Make a transfer](https://docs.raiden.network/using-raiden/the-raiden-web-interface/payment#pay-from-the-tokens-screen) to the hub ```hub.raiden.network```

#### Minting Manually

It is possible that the minting feature in the Light Client does not work out-of-the-box with every custom token. You can still try to mint the token manually:

1. Visit [this page on Etherscan](https://goerli.etherscan.io/token/0x59105441977ecD9d805A4f5b060E34676F50F806#writeContract) where you'll be able to write to the TTT contract
2. Open your MetaMask and choose your Goerli account with ETH
3. Go back to Etherscan and click "Connect to Web3"
4. Scroll down to the "mint" field and enter ```1000000000000000000000```
5. Click the "Write" button and confirm the transaction in MetaMask. MetaMask will show the transaction status as "Confirmed" when it has succeeded

![Etherscan TTT acquisition](https://drive.google.com/uc?export=view&id=1M81D3dsWnHCDeP25rY0RpGS9DsPg2lUa)

### Start Developing

#### Prerequisites

To run the code in this repository, you must have Node.js 10+ on your computer and a web3-enabled browser (e.g. Firefox with Metamask extension), as well as some ETH on the account.

#### SDK Documentation

Go to the [SDK Documentation](https://lightclient.raiden.network/docs/) for more information on how to install and use the SDK.

#### dApp Installation

```bash
git clone --recurse-submodules https://github.com/raiden-network/light-client.git
cd light-client/raiden-dapp
```

##### Build the Raiden SDK

 First you need to build the sdk. For this you have to go to the `raiden` directory and run the following commands.

```bash
cd ../raiden-ts
npm install
npm run build
```

##### Install the dApp Dependencies

Then you need to install the wallet app dependencies.

```bash
cd ../raiden-dapp
npm install --save raiden-ts
```

This will also create a symbolic link in `raiden-dapp/node_modules/raiden-ts` to `raiden-ts`.

##### Running the dApp locally

To start the development server you have to run the following command.

```bash
npm run serve
```

After the development server starts you have to navigate to `http://localhost:8080`, in order to use the Raiden dApp. It requires either MetaMask to be installed on your browser or some other web3 provider (e.g. Wallet apps with dApp support).


## Roadmap and Timeline
We are working in [2 weekly iterations](https://github.com/raiden-network/light-client/projects). Priorities are managed within the [Product Backlog](https://github.com/raiden-network/light-client/milestone/1). 

With the [first testnet release](https://github.com/raiden-network/light-client/releases) we have reached milestone 0, where the SDK and dApp are able to send transfers, but will not be able to receive transfers.

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
