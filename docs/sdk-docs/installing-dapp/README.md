# Install and Run the dApp

Clone the Raiden Light Client repository.

```bash
git clone --recurse-submodules https://github.com/raiden-network/light-client.git
```

## Build the SDK

Change to the `raiden-ts` directory inside your newly cloned project, install the dependencies and build the SDK.

```bash
cd light-client
pnpm run build --filter raiden-ts
```

## Run the dApp locally

Start the development server by running the following command:

```bash
pnpm run serve --filter raiden-dapp
```

Once the development server has been started, navigate to `http://localhost:8080` to start using the Raiden dApp.

> Note that for the Raiden dApp to work it requires MetaMask or some other Web3 provider (wallet apps with dApp support) to be installed on your browser.
