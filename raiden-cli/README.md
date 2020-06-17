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

The Raiden Light Client SDK is a [Raiden Network](https://raiden.network) compatible client written in JavaScript/Typescript, capable of running in modern web3-enabled browsers, wallets and Node.js environments.

The goal of the CLI is provide a HTTP REST server that is fully compatible with the [Raiden API specification](https://raiden-network.readthedocs.io/en/latest/rest_api.html). 

The CLI is considered experimental and mostly used for testing internally, not yet stable enough for production usage. Be aware that not all endpoints the specification defines are already implemented yet.

It requires the latest [Node.js LTS (12.x - Erbium)](https://github.com/nodejs/Release)

> **INFO:** The Light Client SDK, dApp and CLI are **work in progress** and can only be used on the Ethereum **Testnets**.

## Try it out

### Build the SDK
```sh
cd ../raiden-ts/
npm ci  # install/update SDK's dependencies, if needed; it'll also build the SDK
npm run build  # or if dependencies are already installed, just rebuild
cd -
```

The SDK transpilation can be quite heavy on memory. If you are building on low-end devices and get out-of-memory errors on the build step, try increasing memory or swap size. Optionally, you can build the SDK on a more capable machine (even of different architecture) and copy/rsync `dist` and `dist:cjs` output folders to `../raiden-ts`.


### Build the CLI
```sh
npm ci  # install/update CLI dependencies, if needed
npm run build  # build the dependent output
npm run build:bundle  # build the bundled output
```

The `build` script will output `./build/index.js`, which requires dependencies in place in `../raiden-ts/node_modules`, `../raiden-ts/dist*/` and `./node_modules/` folders.
The `build:bundle` script will output `./build/bundle.js`, which depends only on `*.node` native libraries copied to the same output folder, therefore is a portable bundle which can be moved around (as long as the native libraries are in the same folder). Again, if getting out-of-memory errors, you can build these files on a more capable machine, just be careful to copy the correct native libraries to the output folder if on a different architecture (e.g. copy `./node_modules/wrtc/build/Release/wrtc.node` to `./build`)

### Run the CLI

You can see a summary of the options:
```sh
node build/index.js --help
# or
node build/bundle.js --help
```

The CLI currently exposes parameters to configure the Raiden node that runs behind the REST service.

To run the CLI for the very first time, the only two thing necessary are a keystore file and an Ethereum node.

```sh
node build/index.js -e https://provider.web3:8545 -k /path/privkey.json
```

This starts the Raiden node and connects to a REST interface. The state is stored in `./storage` as JSON files. It's expected that the account is already funded with ETH to pay for on-chain transactions.

How the REST interface looks like and how the request and respond messages look like, please investigate on the [Raiden API documentation](https://raiden-network.readthedocs.io/en/latest/rest_api.html).

## Contributing

Any contributions you make are **greatly appreciated**. Refer to the
[development guide](./CONTRIBUTING.md) for details on how to comply with our
codestyle, patterns and quality requirements. Although this is still more
experimental and internal than SDK and dApp, questions and issues can be
reported in the issue tracker.

## License

Distributed under the [MIT License](../LICENSE).
