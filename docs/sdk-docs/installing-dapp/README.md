# Install and Run the dApp

Clone the Raiden Light Client repository.

```bash
git clone --recurse-submodules https://github.com/raiden-network/light-client.git
```

## Build the SDK

Change to the `raiden-ts` directory, install the dependencies and build the SDK.

```bash
cd ../raiden-ts
npm install
npm run build
```

## Install the dApp dependencies

Change to the `raiden-dapp` directory and install its dependencies.

```bash
cd ../raiden-dapp
npm install --save raiden-ts
```

This will create a symbolic link in `raiden-dapp/node_modules/raiden-ts` to `raiden-ts`.

## Run the dApp locally

Start the development server by running the following command:

```bash
npm run serve
```

Once the development server has been started, navigate to `http://localhost:8080` to start using the Raiden dApp.

> Note that for the Raiden dApp to work it requires MetaMask or some other Web3 provider (wallet apps with dApp support) to be installed on your browser.