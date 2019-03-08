<!-- PROJECT SHIELDS -->

<!-- Gitter Badge -->
<!-- CI-Status Badge -->

<h2 align="center">
  <br/>
  <a href='https://raiden.network/'><img 
      width='400px' 
      alt='' 
      src="https://user-images.githubusercontent.com/35398162/54016605-c26dae80-4183-11e9-8a19-c7ebd86bf706.png" /></a>
  <br/>
  Raiden Light Client SDK and Wallet
  <br/>
</h2>

<h4 align="center">
  A JavaScript SDK and wallet to make fast, cheap, scalable token transfers with other <a href="https://github.com/raiden-network/raiden">Raiden Clients</a>
</h4>

<p align="center">
  <a href="#getting-started">Getting Started</a> ∙
  <a href="#license">License</a> ∙
  <a href="#devkit">DevKit</a> ∙
  <a href="#description">Description</a> ∙
</p>

Raiden Light Client is a [Raiden Network](https://raiden.network) compatible client written on JavaScript/Typescript, capable of running in modern web3-enabled browsers, wallets and Node.js environments.


# Raiden Light Client

Repository for Raiden Light Client implementation

Raiden Light Client is a [Raiden Network](https://raiden.network) compatible client written on JavaScript/Typescript, capable of running in modern web3-enabled browsers and Node.js environments.

Raiden Light Client (Raiden-LC) is split in two parts:

## raiden-sdk

Module and main class may be called only Raiden, contains the logic for interacting with Raiden network from a web3.js-compatible interface/account through off-chain communication channels such as [Matrix.org](https://matrix.org) rooms on [Raiden Matrix Federation](https://github.com/raiden-network/raiden-transport) servers and sending payments through it.

## raiden-wallet

First demo web-dapp using raiden-sdk to create a wallet-like interface to connect and operate a Raiden Network light-client account.

# License

Raiden Light Client and Raiden Core are distributed under [MIT License](./LICENSE)
