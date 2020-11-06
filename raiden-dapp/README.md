# Raiden dApp

> **INFO:** The Raiden dApp is a reference implementation of the Raiden Light Client SDK. It is a work in progress.

## Demo

You can access an alpha testnet version of the Raiden dApp at https://lightclient.raiden.network/. 

## Project Setup

1. Install dependencies  

   In the root directory run:

   ```bash
   yarn install
   ```

2. Build the SDK  

   ```bash
   yarn workspace raiden-ts build
   ```

3. Serve dApp for development  

   ```
   yarn workspace raiden-dapp serve
   ```

4. Compile dApp for production  

   ```
   yarn workspace raiden-dapp build
   ```

## Run Tests

1. Unit tests

   ```
   yarn workspace raiden-dapp test
   ```

2. E2E tests

   ```
   yarn workspace raiden-dapp test:e2e:docker
   ```

## Check Linting

```
yarn workspace raiden-dapp lint
```
