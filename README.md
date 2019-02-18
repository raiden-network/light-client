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
