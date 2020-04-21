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
    - [Prerequisites](#prerequisites)
    - [SDK Documentation](#sdk-documentation)
    - [dApp Installation](#dapp-installation)
      - [Build the Raiden SDK](#build-the-raiden-sdk)
      - [Install the dApp Dependencies](#install-the-dapp-dependencies)
      - [Running the dApp locally](#running-the-dapp-locally)
- [Use the dApp in different environments](#use-the-dapp-in-different-environments)
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

- You should be able to interact with the Raiden Network easily with your dApp.
- We want to help you to enable your users to make token transfers using their consumer wallets like imToken or Metamask.
- It should be possible to send tokens using low end devices, which would not be capable of running a full Raiden node.

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

- Checkout the [developer portal](http://developer.raiden.network)
- Look at the [documentation](https://raiden-network.readthedocs.io/en/stable/index.html)
- Learn more by watching explanatory [videos](https://www.youtube.com/channel/UCoUP_hnjUddEvbxmtNCcApg)
- Read the blog posts on [Medium](https://medium.com/@raiden_network)

### Try Out the Raiden Demo dApp

The Raiden dApp is the demo and first dApp user of the SDK. It's a single page application (SPA) built on top of [Vue.js](https://vuejs.org/), [vuex](https://vuex.vuejs.org) and [vuetify](https://vuetifyjs.com) as UI framework which uses Material Design as the design guideline.

These step-by-step instructions will guide you through the process for trying out the Raiden demo dApp. The dApp is hosted at [https://lightclient.raiden.network/](https://lightclient.raiden.network/) and we will be using the Goerli testnet and MetaMask wallet in this example.

**Prerequisites**

1. You need to have MetaMask installed for your browser. If you don't have MetaMask, [visit their website](https://metamask.io/) to download and install it.
2. It is NOT recommended to use the dApp on mobile (but it works).

**Step 1: Acquire ETH**

1. Go to the Goerli faucet at [htts://faucet.goerli.mudit.blog](https://faucet.goerli.mudit.blog) or [https://goerli-faucet.slock.it/](https://goerli-faucet.slock.it/)
2. Follow the instructions on how to acquire Goerli ETH on respective website

**Step 2: Navigate to the Raiden Hub**

1. Visit the Raiden Hub Page at [https://hub.raiden.network/](https://hub.raiden.network/)
2. Click **Open Channel with Hub** to get forwarded to [https://lightclient.raiden.network/](https://lightclient.raiden.network/)

**Step 3: Connect to the Raiden dApp**

1. Click **Connect** to connect the dApp to your MetaMask

**Step 4: Select a Hub and Open a Channel**

1. Click the mint button next to your token balance, to mint some TTT tokens.
2. Click **Select Hub**
3. Enter the amount of TTT Tokens you want to deposit when opening a channel with the hub
4. Sign the deposit with your MetaMask.
5. Click **Open Channel**.
6. Sign "Open Channel", "Approve" and "Set Total Deposit" with your MetaMask when prompted

**Step 5: Make a transfer**

1. Enter the address of the node receiving your transfer (eg. `hub.raiden.network`)
2. Enter the amount you want to transfer
3. Click **Transfer**

**Optional: Use a Raiden Full Node**

1. Navigate to https://docs.raiden.network/quick-start and follow the instructions
2. [Join the TTT token network](https://docs.raiden.network/using-raiden/the-raiden-web-interface/join-a-token-network)
3. [Make a transfer](https://docs.raiden.network/using-raiden/the-raiden-web-interface/payment#pay-from-the-tokens-screen) to the hub `hub.raiden.network`

#### Minting Manually

It is possible that the minting feature in the Light Client does not work out-of-the-box with every custom token. You can still try to mint the token manually:

1. Visit [this page on Etherscan](https://goerli.etherscan.io/token/0xE2b702eD684bEb02850ac604278f078A4ce8b6E6#writeContract) where you'll be able to write to the TTT contract
2. Open your MetaMask and choose your Goerli account with ETH
3. Go back to Etherscan and click "Connect to Web3"
4. Scroll down to the "mint" field and enter `1000000000000000000000`
5. Click the "Write" button and confirm the transaction in MetaMask. MetaMask will show the transaction status as "Confirmed" when it has succeeded

![Etherscan TTT acquisition](https://drive.google.com/uc?export=view&id=1M81D3dsWnHCDeP25rY0RpGS9DsPg2lUa)

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

## Use the dApp In Different Environments

```
{
  "address": "0x2a23F385d32dcce35824D4498Bb10f9B6575B2de",
  "version": 2,
  "chainId": 5,
  "registry": "0x9b0c8C8C75904CEf5B7a8dbF59c3459Ea85c6526",
  "blockNumber": 2561973,
  "config": {

  },
  "channels": {
    "0x2001E8851d33CA476e209e37ED8db1BB9E72334F": {
      "0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf": {
        "state": "open",
        "own": {
          "deposit": "2000000000000000",
          "locks": [

          ],
          "balanceProof": {
            "chainId": "5",
            "tokenNetworkAddress": "0x2001E8851d33CA476e209e37ED8db1BB9E72334F",
            "channelId": "84",
            "nonce": "2",
            "transferredAmount": "1000000000000000",
            "lockedAmount": "0",
            "locksroot": "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
            "messageHash": "0xea95e9ff3515d11b7f411ded915244bcfdd31667e6a5ffdad1e4331c618f225d",
            "signature": "0xbc942f4187d7a9b3cc1fa70dcb7741ed30ec04455257b3a3656b44c3a76d41411640c2e214de9edcbe6da007c4e5467b1942c74e4f77c4174d2914c872dd6b6b1b",
            "sender": "0x2a23F385d32dcce35824D4498Bb10f9B6575B2de"
          }
        },
        "partner": {
          "deposit": "0"
        },
        "id": 84,
        "settleTimeout": 500,
        "isFirstParticipant": true,
        "openBlock": 2557334
      }
    }
  },
  "tokens": {
    "0xE2b702eD684bEb02850ac604278f078A4ce8b6E6": "0x2001E8851d33CA476e209e37ED8db1BB9E72334F"
  },
  "transport": {
    "matrix": {
      "server": "https://raidentransport.test001.env.raiden.network",
      "setup": {
        "userId": "@0x2a23f385d32dcce35824d4498bb10f9b6575b2de:raidentransport.test001.env.raiden.network",
        "accessToken": "MDAzOGxvY2F0aW9uIHJhaWRlbnRyYW5zcG9ydC50ZXN0MDAxLmVudi5yYWlkZW4ubmV0d29yawowMDEzaWRlbnRpZmllciBrZXkKMDAxMGNpZCBnZW4gPSAxCjAwNjljaWQgdXNlcl9pZCA9IEAweDJhMjNmMzg1ZDMyZGNjZTM1ODI0ZDQ0OThiYjEwZjliNjU3NWIyZGU6cmFpZGVudHJhbnNwb3J0LnRlc3QwMDEuZW52LnJhaWRlbi5uZXR3b3JrCjAwMTZjaWQgdHlwZSA9IGFjY2VzcwowMDIxY2lkIG5vbmNlID0gUEhPI3MrcTdKOl5ya0hFNAowMDJmc2lnbmF0dXJlIFxcu3t0G0BBJe1frIueVtc0Zp0QQ69m9f2Q7Ii0NEGcCg",
        "deviceId": "RAIDEN",
        "displayName": "0x0e9da5a56268c953d40a7328c778e7c055a50ad448be2568cd8d2e8043bdc1fb3577d582ec2fda90a41feca819ba7f65d35ad7cda14c88884cf785654c38f53a1c"
      },
      "rooms": {
        "0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf": [
          "!mApJTkipXpCDGmvxhp:raidentransport.test001.env.raiden.network"
        ]
      }
    }
  },
  "sent": {
    "0x87df4eb055bb8028065f63dd82bd85d6a3f15fb76206e3f9d58da1641a62e72d": {
      "transfer": [
        1587393007683,
        {
          "type": "LockedTransfer",
          "message_identifier": "1587393007633",
          "chain_id": "5",
          "token_network_address": "0x2001E8851d33CA476e209e37ED8db1BB9E72334F",
          "channel_identifier": "84",
          "nonce": "1",
          "transferred_amount": "0",
          "locked_amount": "1000000000000000",
          "locksroot": "0x9d7c72ef40d3c003bd992cbaad53234d952e22dd330000e8807edd6dd5c8e5c6",
          "payment_identifier": "1587392940709",
          "token": "0xE2b702eD684bEb02850ac604278f078A4ce8b6E6",
          "recipient": "0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf",
          "lock": {
            "amount": "1000000000000000",
            "expiration": "2557479",
            "secrethash": "0x87df4eb055bb8028065f63dd82bd85d6a3f15fb76206e3f9d58da1641a62e72d"
          },
          "target": "0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf",
          "initiator": "0x2a23F385d32dcce35824D4498Bb10f9B6575B2de",
          "metadata": {
            "routes": [
              {
                "route": [
                  "0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf"
                ]
              }
            ]
          },
          "signature": "0x62d9987eabd152c3f393c8695a910d80ac9def7fea40daefdedc638363022b0d654a816dd449b6ee667a380c125e4a0961eeb80f2e3054139fc9c254dd1fde911c"
        }
      ],
      "fee": "0",
      "partner": "0x1F916ab5cf1B30B22f24Ebf435f53Ee665344Acf",
      "secret": [
        1587393007696,
        {
          "value": "0x61eebeeaec066b06eb471a79c87ef62d03147cdb20865b30be48666b3d8d76a8",
          "registerBlock": 0
        }
      ],
      "transferProcessed": [
        1587393008521,
        {
          "message_identifier": "1587393007633",
          "signature": "0xaff6bb6f0337818470d14744c5ebe767710f708c40521786c4ff539456a643d5363cf84ec155efbd3f47e30e2ce0b6bf790b64ac2775a676975fd38366dbfe961c",
          "type": "Processed"
        }
      ],
      "secretRequest": [
        1587393008534,
        {
          "signature": "0xbf4c9ebcbdfe296cff10eae66359f53b1ec313eda96db87b836c823219479c2a186eab1de5450747504aa3210913e69b36dda7a3f44a0806f711abd516fc455d1b",
          "payment_identifier": "1587392940709",
          "amount": "1000000000000000",
          "message_identifier": "14127396435016474222",
          "secrethash": "0x87df4eb055bb8028065f63dd82bd85d6a3f15fb76206e3f9d58da1641a62e72d",
          "expiration": "2557479",
          "type": "SecretRequest"
        }
      ],
      "secretReveal": [
        1587393008548,
        {
          "type": "RevealSecret",
          "message_identifier": "1587393008535",
          "secret": "0x61eebeeaec066b06eb471a79c87ef62d03147cdb20865b30be48666b3d8d76a8",
          "signature": "0xedc1f06c05f47b4be7a0faa26a185d3c639127aaa543a98b13a6d6a3d97cbb4e612364e87c7c7518dd578bdc8cc4ea0cf0c82b9971fedc7936621eb9e61044f71b"
        }
      ],
      "unlock": [
        1587393009342,
        {
          "type": "Unlock",
          "message_identifier": "1587393009328",
          "chain_id": "5",
          "token_network_address": "0x2001E8851d33CA476e209e37ED8db1BB9E72334F",
          "channel_identifier": "84",
          "nonce": "2",
          "transferred_amount": "1000000000000000",
          "locked_amount": "0",
          "locksroot": "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
          "payment_identifier": "1587392940709",
          "secret": "0x61eebeeaec066b06eb471a79c87ef62d03147cdb20865b30be48666b3d8d76a8",
          "signature": "0xbc942f4187d7a9b3cc1fa70dcb7741ed30ec04455257b3a3656b44c3a76d41411640c2e214de9edcbe6da007c4e5467b1942c74e4f77c4174d2914c872dd6b6b1b"
        }
      ],
      "unlockProcessed": [
        1587393010215,
        {
          "message_identifier": "1587393009328",
          "signature": "0x25795c14e4036a50fae16776a7157e41a08e838053fb21fe0067ece114954a5e62acaee6222e381077f676423fba6f08e722ea09447006c99ea6465fa0adf5bc1c",
          "type": "Processed"
        }
      ]
    }
  },
  "received": {

  },
  "path": {
    "iou": {

    }
  },
  "pendingTxs": [

  ]
}
```

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
