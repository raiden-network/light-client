# Raiden dApp

The Raiden dApp is a reference implementation of the [Raiden Light Client SDK](https://github.com/agatsoh/light-client/tree/master/raiden-ts), which can be used with web3 wallets like [MetaMask](https://metamask.io) (Desktop) or [imToken](https://token.im/download) (mobile).

The Raiden dApp is a **work in progress** project which has been released only for testnets.

It is crucial to read the following [README](https://github.com/agatsoh/light-client/blob/master/README.md) including the security notes carefully before using the software.

You can access the beta testnet
version of the Raiden dApp at [https://lightclient.raiden.network/](https://lightclient.raiden.network/) and the full documentation is available at [https://lightclient.raiden.network/docs/](https://lightclient.raiden.network/docs).

# Development

## Run the Repository Code

Perform the following steps from the root directory:

1. **Install dependencies**  
   
   ```bash
   yarn install
   ```

2. **Build the SKD**  

   ```bash
   yarn workspace raiden-ts build
   ```

3. **Serve the dApp for development**  

   ```bash
   yarn workspace raiden-dapp serve
   ```

## Compile the Raiden dApp for Production

From the root directory run:

```bash
yarn workspace raiden-dapp build
```

## Run Test Suites

From the root directory run:

- **Unit Tests**  

  ```bash
  yarn workspace raiden-dapp
  ```

- **E2E Tests**  

  ```bash
  yarn workspace raiden-dapp test:e2e:docker
  ```

## Run Linter

From the root directory run:

```bash
yarn workspace raiden-dapp lint
```
