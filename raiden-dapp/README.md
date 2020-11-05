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
   cd raiden-ts
   yarn build
   ```

3. Serve dApp for development  

   ```
   cd ../raiden-dapp
   yarn serve
   ```

4. Compile dApp for production  

   ```
   yarn build
   ```

## Run Tests

1. Unit tests

   ```
   yarn test
   ```

2. E2E tests

   ```
   yarn test:e2e:docker
   ```

## Check Linting

```
yarn lint
```
