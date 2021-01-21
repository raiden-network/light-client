# Install and Run the dApp

Clone the Raiden Light Client repository.

```bash
git clone --recurse-submodules https://github.com/raiden-network/light-client.git
```

## Build the SDK

```bash
cd light-client
yarn workspace raiden-ts build
```

## Run the dApp locally

Start the development server by running the following command:

```bash
yarn workspace raiden-dapp run serve
```

Once the development server has been started, navigate to `http://localhost:8080` to start using the Raiden dApp.

> Note that the Raiden dApp requires MetaMask or another Web3 provider (wallet apps with dApp support) to be installed on your browser.

## Recover Backup locally

You might have a backup by a dApp instance that was provided by a service that
is not available anymore. You can not import this backup to another dApp
provider if you were using a Raiden subkey (configuration option). The subkey
generation is dependent on the origin URL which is serving the dApp and the
Ethereum chain it is connected to. Therefore this will result into a different
key for each dApp provider and chain.

To still being able to recover your backup you can run the dApp locally and tell
it to act like it would be served by a specific origin. Therefore you need to
edit the `raiden-dapp/.env.development` file and add the following line:

```sh
VUE_APP_SUBKEY_ORIGIN_URL=https://<url-of-old-service>
```

Afterwards continue to run the dApp locally [as describe
earlier](#install-and-run-the-dapp). Remember that you need to restart the dApp
if you have it already running to reload the environment variables.
