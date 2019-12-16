# Connecting to a Test Network

Connecting to a Raiden test network is automatically done by the Light Client SDK. The SDK will automatically connect to the proper Raiden network based on the detected network id on your web3 provider.

The SDK provides out of the box support for the deployed networks on Ropsten, Rinkeby, and Mainnet.

If you want you can also use the Light Client SDK to connect to networks that are not officially supported.

To connect for example on a privately deployed Raiden network,
you can initialize the SDK as usual, and pass the Contract Info as the fourth parameter of the create function.

```typescript
import { Raiden } from 'raiden-ts';

# async factory
const raiden = await Raiden.create(web3.currentProvider, 0, localStorage, contractInfo);
```

Contract info is a JSON file that is generated when you deploy [raiden-contracts](https://github.com/raiden-network/raiden-contracts).

## Using the SDK in a Private Chain or a Development Environment

If you want to use the SDK in a private chain or a development environment, you can follow [this guide](https://github.com/raiden-network/light-client/wiki/Using-the-SDK-in-a-private-chain-or-a-development-environment).