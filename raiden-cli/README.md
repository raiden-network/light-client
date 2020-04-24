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

The CLI is considered experimental and mostly used for testing internally, not yet stable enough for production usage.

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

The CLI currently exposes a very limited set of actions. Some of them are exposed through cli parameters, and some through a served REST API which resembles the [Raiden API](https://raiden-network.readthedocs.io/en/stable/rest_api.html), but we aim at being fully compatible with it in the future.

On first run, if you don't have channels yet, the only way to opening and funding them right now is through cli options:
```sh
node build/index.js -e https://provider.web3:8545 -k /path/privkey.json --token <token_address> --partner <partner_address> --deposit <token_wei> --mint
```

This should start the client, perform initial sync, open channel with partner on token network, mint and deposit an amount, then exit. The state is stored in `./storage` as JSON files. It's expected the account to already be funded at least of ETH, since tokens can be minted on the testnets. If you run CI with these options again, it should be idempotent, detect the open and funded channel, and skip if not needed.

### Serving and transfering
```sh
node build/index.js -e https://provider.web3:8545 -k /path/privkey.json --serve 5001
# on another terminal
curl -v -H 'Content-Type: application/json' http://localhost:5001/api/v1/payments/<token_address>/<target_address> -d '{ "amount": 2  }'
# check channels and balances
curl -v http://localhost:5001/api/v1/channels
```

The served instance can be stopped with `Ctrl+C` (interrupt signal). It'll try to stop gracefully, but you can safely send the signal again after a couple of seconds if it's taking longer than expected to exit (due to Node's leftover requests or promises), and it'll force-exit.

## Contributing

Any contributions you make are **greatly appreciated**. Refer to the [Raiden Light Client Development Guide](../CONTRIBUTING.md) for details on how to comply with our codestyle, patterns and quality requirements. Although this is still more experimental and internal than SDK and dApp, questions and issues can be reported in the issue tracker.

## License

Distributed under the [MIT License](../LICENSE).
