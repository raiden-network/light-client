<!-- PROJECT SHIELDS -->

<h2 align="center">
  <br/>
  <a href='https://raiden.network/'><img
      width='400px'
      alt=''
      src="https://user-images.githubusercontent.com/35398162/54018436-ee3f6300-4188-11e9-9b4e-0666c44cda53.png" /></a>
  <br/>
  Raiden Light Client CLI
  <br/>
</h2>

<h4 align="center">
  Node.js command line application using the <a href="https://github.com/raiden-network/light-client/tree/master/raiden-ts">Raiden Light-Client SDK</a>
</h4>

The goal of the CLI is to provide a HTTP REST server that is fully compatible with the [Raiden API specification](https://raiden-network.readthedocs.io/en/latest/rest_api.html). It uses the Raiden Light Client SDK internally.

The CLI is considered experimental and mostly used for testing internally, not yet stable enough for production usage. Be aware that not all endpoints the specification defines are implemented yet.

It requires the latest [Node.js LTS (14.x - Fermium)](https://github.com/nodejs/Release)

> **INFO:** The Light Client SDK, dApp and CLI are **work in progress** and can only be used on the Ethereum **Testnets**.

## Requirements for Safe Usage

- **Layer 1 works reliably:** That means that you have got a web3 provider (eg. MetaMask) that is always synced and working reliably. If there are any problems or bugs on the client then Raiden can not work reliably.

- **Persistency of local DB:** Your local state database is stored in a Leveldown database at `--datadir` path (default `./storage`). This data should not be deleted by the user or tampered with in any way. Frequent backups are also recommended. Deleting this storage could mean losing funds.

- **Raiden account has sufficient ETH:** Raiden will try to warn you if there is not enough ETH in your Raiden account in order to maintain your current open channels and go through their entire cycle. But it is your job as the user to refill your account with ETH and always have it filled.

- **Raiden always online:** Make sure that your node is always working, your network connection is stable and that the Raiden node is always online. If it crashes for whatever reason you are responsible to restart it and keep it always online. We recommend running it inside some form of monitor that will restart if for some reason the Raiden node crashes.

- **Ethereum client always online:** Make sure that your Ethereum client is always running and is synced. We recommend running it inside some form of monitor that will restart if for some reason it crashes.
- **Ethereum client is not changed:** Swapping the Ethereum client while transactions are not mined is considered unsafe. We recommend avoiding switching Ethereum clients once the Raiden node is running.

- **Raiden REST API is never exposed to the public:** For Raiden's operation, the client needs to be able to sign transactions at any point in time. Therefore you should never expose the Raiden Rest API to the public. Be very careful when changing the `--api-address` and `--rpccorsdomain` values.

## Try it out

You can install the package from the [NPM registry](https://www.npmjs.com/):

```sh
$ yarn global add @raiden_network/raiden-cli
$ export PATH="$(yarn global bin):$PATH"
$ raiden --help
# or
$ npm install --global @raiden_network/raiden-cli
$ raiden --help
```

### Aarch64 (ARM64) environments

The Light Client has some development and runtime native libraries as dependencies which may require a proper architecture to work.
In Arm64 processors (e.g. Apple M1 computers) you may want to ensure the following libraries are properly installed for your native architecture:

```sh
$ brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

Alternatively, use [Rosetta](https://support.apple.com/en-us/HT211861) to switch to a `x86_64` environment:

```sh
$ arch -x86_64 $SHELL
```

Then, ensure NodeJS VM as well as `node_modules` dependencies are installed for this architecture.

```sh
$ node -p process.arch
x64
```

## Development

### Build the CLI

```sh
yarn install
yarn workspace raiden-ts build # build local dependency
yarn workspace @raiden_network/raiden-cli build # build the dependent output
yarn workspace @raiden_network/raiden-cli build:webui # download and place webUI files
yarn workspace @raiden_network/raiden-cli build:bundle # build the bundled output; optional
```

The `build` script will output `./build/index.js`, which requires that the dependencies are in place in the `../raiden-ts/node_modules`, `../raiden-ts/dist*/` and `./node_modules/` folders.
The `build:bundle` script will output `./bundle/index.js`, which depends only on `*.node` native libraries copied to the same output folder, therefore is a portable bundle which can be moved around (as long as the native libraries are in the same folder).

If getting out-of-memory errors, you can build these files on a more capable machine, just be careful to copy the correct native libraries to the output folder if on a different architecture (e.g. copy `./node_modules/wrtc/build/Release/wrtc.node` to `./bundle`)

### Run the CLI

You can see a summary of the options:

```sh
./raiden --help
```

The CLI currently exposes parameters to configure the Raiden node that runs behind the REST service.

Calling it without parameters will run with default options, which include trying to use `http://localhost:8545` as Ethereum JSON RPC Endpoint, looking for keystore JSONs in `./` (and showing a selection menu) and storing database in `./storage`. You probably want to change these options, e.g.:

```sh
./raiden --eth-rpc-endpoint https://goerli.infura.io/v3/YOUR-PROJECT-ID --datadir ~/.raiden --keystore-path ~/.ethereum/goerli/keystore --address 0xYourAddress
```

### Documentation

The [Raiden API documentation](https://raiden-network.readthedocs.io/en/latest/rest_api.html) describes the available API endpoints and provides example requests and responses.

### Custom options

The CLI diverges slightly (in a compatible manner) from the Python Client REST API above, mostly adding some more information to certain endpoints, new useful endpoints to expose specifics of CLI's internals and command-line parameters for new features, while ignoring certain unsupported parameters from the Python Client's entrypoint command. Here are some notable examples:

- `GET|PATCH /api/v1/config`: returns the current config of the SDK and allows changing specific options at runtime;
- `GET /api/v1/state.json`: returns the state (database) dump, as a JSON array, in real time;
- `--load-state <state.json>`: command-line option to reload/rehydrate a previous state in a new machine/folder/instance

Note: `/api/v1/state.json` and `--load-state` are compatible with dApp's State Backup / Upload functionality, allowing one to migrate between one another;
Warning: be sure to not run two instances on the same network and account simultaneously; also, if you ran an instance for any amount of time on another client, you must download and sync the state manually on the other session, as to avoid getting out of sync with the network.

## Contributing

Any contributions you make are **greatly appreciated**. Refer to the
[development guide](./CONTRIBUTING.md) for details on how to comply with our
codestyle, patterns and quality requirements. Although this is still more
experimental and internal than SDK and dApp, questions and issues can be
reported in the issue tracker.

## License

Distributed under the [MIT License](../LICENSE).
