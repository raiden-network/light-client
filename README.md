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
  <a href="#devkit">DevKit</a> ∙
  <a href="#description">Description</a> ∙
</p>

The Raiden Light Client is a [Raiden Network](https://raiden.network) compatible client written on JavaScript/Typescript, capable of running in modern web3-enabled browsers, wallets and Node.js environments.

The Raiden Wallet is a reference implementation of the Raiden Light Client, which can be used with web3 wallets like Metamask (Desktop) or imWallet (mobile).


## About The Project

There is already a Raiden client available, which has been [released for mainnet in December 2018](https://medium.com/raiden-network/red-eyes-mainnet-release-announcement-d48235bbef3c). However, we want create an easy to use Light Client SDK, which can be integrated by any JavaScript developer to make it easier to send tokens through the Raiden Network.

Here's why:.
* You should be able to interact with the Raiden Network easily with your dApp.
* We want you to be enable your users to make token transfers using their consumer wallets like imToken or Metamask.
* It should be possible to send tokens using low end devices.


## raiden-sdk

Module and main class may be called only Raiden, contains the logic for interacting with Raiden network from a web3.js-compatible interface/account through off-chain communication channels such as [Matrix.org](https://matrix.org) rooms on [Raiden Matrix Federation](https://github.com/raiden-network/raiden-transport) servers and sending payments through it.

## raiden-wallet

First demo web-dapp using raiden-sdk to create a wallet-like interface to connect and operate a Raiden Network light-client account.

# License

Distributed under the [MIT License](./LICENSE).
