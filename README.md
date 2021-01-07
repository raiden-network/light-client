<!-- PROJECT SHIELDS -->

<h2 align="center">
  <br/>
  <a href='https://raiden.network/'><img 
      width='400px' 
      alt='Raiden Logo' 
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
  <a href="#try-out-the-raiden-demo-dapp">Try Out the Raiden dApp</a>
</p>

<p align="center">
  <a href="https://circleci.com/gh/raiden-network/light-client">
   <img src="https://circleci.com/gh/raiden-network/light-client.svg?style=svg&circle-token=2586ec4e7d610d2a114e4a833fa44ef6c00d9e97" alt="CircleCI Badge"/>
  </a>
  <a href="https://codecov.io/gh/raiden-network/light-client">
    <img src="https://codecov.io/gh/raiden-network/light-client/branch/master/graph/badge.svg?token=QzmREKozOH" alt="Codecov Badge">
  </a>
  <a href="https://codeclimate.com/github/raiden-network/light-client/maintainability">
    <img src="https://api.codeclimate.com/v1/badges/d59cce05c229296c848d/maintainability" 
    alt="Code Climate Badge"/>
  </a>
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square" alt="Code Style: prettier Badge">
  </a>
  <a href="https://gitter.im/raiden-network/raiden">
    <img src="https://badges.gitter.im/gitterHQ/gitter.png" alt="Gitter Raiden Badge">
  </a>
</p>

The Raiden Light Client SDK is a [Raiden Network](https://raiden.network) compatible client written in JavaScript/Typescript, capable of running in modern web3-enabled browsers, wallets and Node.js environments.

The Raiden CLI is a reference implementation that provides a HTTP REST server which is fully compatible with the [Raiden API specification](https://docs.raiden.network/raiden-api-1/resources).

The [Raiden dApp](#raiden-dapp) is a reference implementation of the Raiden Light Client SDK, which can be used with web3 wallets like [Metamask](https://metamask.io/) (Desktop) or [imToken](https://token.im/download) (mobile).

> **INFO:** The Light Client SDK, CLI and dApp are all **work in progress** projects. All three projects have been released for mainnet and all code is available in the [Light Client repository](https://github.com/raiden-network/light-client). As this release still has its limitations and is a beta release, it is crucial to read this readme including the security notes carefully before using the software.

## Table of Contents

- [About the Project](#about-the-project)
- [Architecture](#architecture)
  - [Raiden Light Client SDK](#raiden-light-client-sdk)
  - [Architecture diagram](#architecture-diagram)
- [Learn about Raiden](#learn-about-raiden)
- [Try Out the Raiden dApp](#try-out-the-raiden-dapp)
  - [Prerequisites](#prerequisites)
  - [Making a First Transfer on Mainnet](#making-a-first-transfer-on-mainnet)
  - [Making a First Transfer on Testnet](#making-a-first-transfer-on-testnet)
  - [Receiving Transfers](#receiving-transfers)
  - [Backup the State to Keep Your Tokens](#backup-the-state-to-keep-your-tokens)
- [Run the Repository Code](#run-the-repository-code)
  - [Prerequisites](#prerequisites)
  - [SDK Documentation](#sdk-documentation)
  - [CLI Documentation](#cli-documentation)
  - [Install and Run the dApp](#install-and-run-the-dapp)
- [Roadmap and Timeline](#roadmap-and-timeline)
- [Contributing](#contributing)
- [Bug Bounty](#bug-bounty)
- [License](#license)
- [Contact](#contact)

## About The Project

The [Raiden Network](https://raiden.network/) is an off-chain scaling solution, enabling near-instant, low-fee and scalable payments. It’s complementary to the Ethereum blockchain and works with any ERC20 compatible token.

The Raiden client code is available [here](https://github.com/raiden-network/raiden) and has been [released for mainnet](https://medium.com/raiden-network/alderaan-mainnet-release-announcement-7f701e58c236).

<center>
<img 
      width='750px' 
      alt='Raiden Diagram' 
      src="https://user-images.githubusercontent.com/43838780/85526750-8ecdc680-b60a-11ea-8a42-07da6b0f8296.png" />
</center>

The goal of the Raiden Light Client SDK is to provide an easy-to-use framework, which can be integrated by any JavaScript developer. The SDK simplifies the process for developers to embed and use the Raiden Network for token transfers in decentralized applications

The SDK aims to make the life of dApp developer easier by:

- Enabling dApps to easier interact with the Raiden Network.
- Helping users to make token transfers using consumer wallets like MetaMask and imToken.
- Enabling transferring and receiving tokens using low-end devices.

## Architecture

### [Raiden Light Client SDK](./raiden-ts/README.md)

The Raiden Light Client SDK is a standalone TypeScript library which contains all the low level machinery to interact with the Ethereum blockchain and the Raiden Network.

Its target audience is blockchain and dApp developers looking to perform transfers in the Raiden Network from their dApps.

By targeting browsers and Node.js as initial platforms, the SDK can reach a majority of the current and in-development dApps, as well as providing a common language reference implementation for re-implementations in other languages and environments.

Look at the [Raiden Light Client SDK folder of this repository](./raiden-ts/README.md) for more information and a technical deep dive into the SDK architecture, technologies and details on the design goals and decisions.

Reading the documentation is highly recommended for anyone who wishes to better understand how the Raiden Light Client works under the hood or wants to contribute to its development.

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

## Learn about Raiden

If you are new to Raiden, we recommend:

- Browsing the [developer portal](http://developer.raiden.network).
- Reading the [Raiden documentation](https://docs.raiden.network/).
- Watching the explanatory [videos](https://www.youtube.com/channel/UCoUP_hnjUddEvbxmtNCcApg).
- Reading our blog posts on [Medium](https://medium.com/@raiden_network).

## Try Out the Raiden dApp

The Raiden dApp is a demo and the first dApp to be built on the SDK. It's a single page application (SPA) built on top of [Vue.js](https://vuejs.org/), [vuex](https://vuex.vuejs.org) and uses [vuetify](https://vuetifyjs.com) Material Design as UI framework.

These step-by-step instructions will guide you through the process for trying out the Raiden demo dApp.

The dApp is hosted on [https://lightclient.raiden.network](https://lightclient.raiden.network/) and in this quick start guide we will be making a transfer using the Light Client on both mainnet and the Goerli testnet with the [MetaMask](https://metamask.io) wallet.

Fot a more in depth user guide, see the [Light Client documentation](https://lightclient.raiden.network/docs/).

### Prerequisites

- MetaMask needs to be installed in your browser and can be [downloaded from their website](https://metamask.io/).
- An ETH balance. for mainnet you'll have to purchase ETH, for the Goerli testnet you can acquire some test ETH by:  

  1. By visiting a Goerli faucet either at [https://faucet.goerli.mudit.blog](https://faucet.goerli.mudit.blog) or [https://goerli-faucet.slock.it/](https://goerli-faucet.slock.it/).
  2. Follow the instructions on respective faucet on how to acquire the ETH.

### Making a First Transfer on Mainnet

1. **Connect to the dApp**  

   1. Visit the [Light Client](https://lightclient.raiden.network).
   2. Make sure **Ethereum Mainnet** is selected in MetaMask and click connect.

2. **Select a Hub and Open a Channel**  

   1. Click the **+** icon and select a mainnet token to use. You need to have a balance of the token.
   2. If you don't have any **RDN** (utility tokens), you can click the icon to open a dialog with a link for exchanging RDN and a button for depositing.
   3. Enter an address of your choice to connect to or select a suggested hub if any are available.
   4. Click the **Select Hub** button
   5. Enter the amount of tokens you want to deposit when opening the channel.
   6. Click the **Open Channel** button and sign with MetaMask.

3. **Make a Transfer**  

   1. Enter the address of the node receiving your transfer.
   2. Enter the amount you want to transfer.
   3. Click the **Transfer** button.

### Making a First Transfer on Testnet

1. **Connect to the dApp**  

   1. Visit the [Raiden Hub page](https://hub.raiden.network).
   2. Click on the **Open Channel with Hub** button.
   3. When redirected to the Light Client make sure **Goerli Test Network** is selected in MetaMask and click connect.

2. **Select a Hub and Open a Channel**  

   1. If you don't have any **SVT** (utility tokens), you can click the icon to mint and deposit **SVT**.
   2. Click on the icon at the very bottom to the right of the **TTT** symbol to mint **TTT** tokens.
   3. Click the **Select Hub** button.
   4. Enter the amount of tokens you want to deposit when opening the channel.
   5. Click **Open Channel** and sign with MetaMask.

3. **Make a Transfer**  

   1. Enter the address of the node receiving your transfer.
   2. Enter the amount you want to transfer.
   3. Click the **Transfer** button.

### Receiving Transfers  

Receiving of transfers will be disabled if the utility token (RND on mainnet and SVT on testnet) balance is too low.

To enable receiving again, make sure to add a utility token balance by either making an exchange and deposit if using the Light Client on mainnet or by minting and depositing if using the Light Client on testnet.

### **Backup the State to Keep Your Tokens**  

   You should store a backup of your state to **avoid losing tokens** in case:

   - You delete your local browser storage.
   - You change computer.
   - You use another browser.

   If you want to continue using the dApp with a specific account after switching browser or changing computer, you'll need to make sure that the dApp is connecting with the most recent state.

   This is important because the state contains all off-chain information needed for making transactions in the Raiden Network.

   The state is stored in the browser across sessions and therefore needs to be downloaded and uploaded whenever you switch browser or computer.

   You can download and upload the state from the **General Menu**.

   > If you lose or delete your state you will also **lose your token**.

   Example of a part of the JSON state file:

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

## Run the Repository Code

### Prerequisites

To run the code in this repository, you must have Node.js 14+ and Yarn installed as well as a web3-enabled browser (e.g. Firefox with Metamask extension), with some ETH on the account.

### SDK Documentation

Go to the [SDK Documentation](https://lightclient.raiden.network/docs/) for more information on how to install and use the SDK.

### CLI Documentation

Go to the [CLI README](https://github.com/raiden-network/light-client/tree/master/raiden-cli) for installation instructions and the current status of the API.

### Install and Run the dApp

1. **Clone repository**  

   ```bash
   git clone --recurse-submodules https://github.com/raiden-network/light-client.git
   cd light-client
   ```

2. **Install dependencies**  

   ```bash
   yarn install
   ```

3. **Build the Raiden SDK**  

   ```bash
   yarn workspace raiden-ts build
   ```

4. **Run the dApp locally**  

   ```
   yarn workspace raiden-dapp serve
   ```

   After the development server starts, navigate to `http://localhost:8080` to use the Raiden dApp.

## Roadmap and Timeline

We are working in [2 weekly iterations](https://github.com/raiden-network/light-client/projects). Priorities are managed within the [Product Backlog](https://github.com/raiden-network/light-client/milestone/1).

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Also have a look at the [Raiden Light Client Development Guide](./CONTRIBUTING.md) for more info.

## Bug Bounty

The Raiden team has undertaken several risk mitigation measures to limit any potential damage caused by bugs or misuse of the software. In addition, a bug bounty is run in order to make sure the software lives up to the highest standards possible. For more information and to participate visit the [Raiden Bug Bounty website](https://raiden.network/bug-bounty.html).

## License

Distributed under the [MIT License](./LICENSE).

## Contact

Dev Chat: [Gitter](https://gitter.im/raiden-network/raiden)

Twitter: [@raiden_network](https://twitter.com/raiden_network)

Website: [Raiden Network](https://raiden.network/)

Mail: contact@raiden.network

Project Link: [https://github.com/raiden-network/light-client](https://github.com/raiden-network/light-client)
