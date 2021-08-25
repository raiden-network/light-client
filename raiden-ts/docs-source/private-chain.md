# Using the Light Client in different network setups

## Table of Contents

- [Preface](#preface)
- [Setting up the Light Client on a private network](#setting-up-the-light-client-on-a-private-network)
  - [Identifying the correct smart contract version](#identifying-the-correct-smart-contract-version)
  - [Locate the smart contract version](#locate-the-smart-contract-version)
  - [Checkout correct version of raiden](#checkout-correct-version-of-raiden)
- [Setting up the Development Environment](#setting-up-the-development-environment)
  - [Locating the Smart Contracts](#locating-the-smart-contracts)
  - [Starting the SDK](#starting-the-sdk)
  - [Changing the dApp to work on the private setup](#changing-the-dapp-to-work-on-the-private-setup)

## Preface

This guide targets users that want to use the Light Client SDK or dApp with a custom network setup. This includes private chain deployments of the Raiden Network or unsupported networks (e.g., Kovan).

To use a private network you first have to deploy the contracts by hand.
Start by following this tutorial on how to deploy and run Raiden Network on a private chain:

- [Raiden on Private Network Tutorial]

After finishing the guide above you should have a running Raiden node along with a private chain with the Raiden Network smart contracts deployed. But before that please go through **Setting up the Light Client on a private network** just below to figure the correct version of `raiden-contracts` and subsequently of `raiden` which will help us deploy the raiden contracts correctly.

## Setting up the Light Client on a private network

### Identifying the correct smart contract version

Before starting your private network setup, you first need to:

1. Select which version of the Light Client you want to use
2. Locate the version of the smart contracts used in that specific version of the Light Client

### Locate the smart contract version

You can easily find out the version of the smart contracts used in your version of the Light Client by checking the `raiden-contracts` submodule in the Light Client GitHub repo.

1. Navigate to the [GitHub] project page
2. Locate the `raiden-ts` subdirectory and look for the `raiden-contracts` submodule _(something like`raiden-contracts @ 770c8cd`)_
3. Look at the commit message and check if it includes the `raiden-contracts` version. If not, follow the submodule link to the contracts repository and locate the `setup.py` file. You'll find the version of the Raiden Contracts by looking at the version variable _(`VERSION = '0.37.5'`)_


After finding the `contracts` version you'll have to go to the [Raiden] repo and locate a version of the python client compatible with your specific version of the smart contracts.

1. Navigate to the [requirements.txt] in the `requirements` folder on the Raiden repo at a specific tag for example `v2.0.0`. list of all [raiden tags].
2. You can see the `contracts` version used by looking at the `raiden-contracts` dependency.

If the python client uses a newer version of the Raiden Contracts, you can navigate to an older tag till you find the version of `raiden-contracts` dependency compatible with that of the `light-client` repository you intend to use.


### Checkout correct version of raiden

You need to check out the correct tag in the Raiden repo that you cloned when deploying Raiden Network on a private chain.

For example, if you need to use the `v2.0.0` tag, you need to first checkout the tag before continuing with the [Install Raiden and dependencies] tutorial after cloning the raiden repository.

```bash
git checkout v2.0.0
```

If you've done everything correctly after following [Raiden on Private Network Tutorial] you should now have `Geth` running a private chain, with the Raiden contracts deployed, and a Raiden node running.

## Setting up the Development Environment

### Locating the Smart contracts

After bootstrapping the network you have to locate the deployment files. The deployment files will point the SDK to the correct smart contracts.

Locate `env/lib/python3.7/site-packages/raiden_contracts/data_${VERSION}/`, in the directory that contains the virtual environment that you created when deploying the Raiden Network on a private chain.

You should find the two following files in this directory:

- `deployment_private_net.json`
- `deployment_services_private_net.json`

Create a `deployment` directory into your project's `src`, copy these files there and proceed with the SDK or dApp initialization.

### Starting the SDK

You can start using the SDK in your setup. If you want to learn more about using the SDK in your project you can reference the [SDK installation] tutorial.

To start the SDK on your private network setup, you need to import the private deployment files. You can find them in the `<rootDir>/src/deployment` directory.

```typescript
import privateDeployment from '@/deployment/deployment_private_net.json';
import privateServicesDeployment from '@/deployment/deployment_services_private_net.json';
import { ContractsInfo } from 'raiden-ts';
```

As soon as the imports exist, you need to construct the `contractsInfo` object and pass it to the Light Client SDK initialization logic.

An example of the SDK initialization function follows:

```typescript
async function initialization() {
  const contractsInfo = {
    ...privateDeployment.contracts,
    ...privateServicesDeployment.contracts,
  } as unknown as ContractsInfo;

  const raiden = await Raiden.create(provider, 0, window.localStorage, contractsInfo);
}
```

Calling the `initialization()` function should enable the SDK to manage channels and send payments in the development environment, using the previously deployed token.

### Changing the dApp to work on the private setup

Out of the box the dApp supports the following public test networks `Görli`, `Rinkeby` and `Ropsten`.

To run the dApp on any other network setup you need to deploy the smart contracts and change the dApp to use this setup.

If you require help running the dApp, you can follow the [instructions].

As soon as you have the dApp running you can locate the [`createRaiden`] function and change it accordingly.

First, you need to import the deployment information, as with the SDK setup.

```typescript
import privateDeployment from '@/deployment/deployment_private_net.json';
import privateServicesDeployment from '@/deployment/deployment_services_private_net.json';
import type { ContractsInfo } from 'raiden-ts';
```

Then you need to construct the `contractsInfo` object.

The [`createRaiden`] function should look like the example below:

```typescript
  private static async createRaiden(
    provider: providers.JsonRpcProvider | string,
    privateKeyOrProviderAccountIndex: string | number = 0,
    stateBackup?: string,
    subkey?: true,
  ): Promise<Raiden> {
    const contractsInfo = {
      ...privateDeployment.contracts,
      ...privateServicesDeployment.contracts,
    } as unknown as ContractsInfo;
..
..
..
  try {
      // const contracts = await ConfigProvider.contracts();

      return await Raiden.create(
        provider,
        privateKeyOrProviderAccountIndex,
        storageOpts,
        contractsInfo,
        {
          pfsSafetyMargin: 1.1,
          ...(process.env.VUE_APP_PFS
          ..
          ..
```

Comment out `const contracts = await ConfigProvider.contracts();` and add `contractsInfo` just below the `storageOpts` variable.

Finally with these changes you need to run

```bash
yarn workspace raiden-dapp serve
```

You might face issues with linting for that you will need to go in the `raiden-dapp` subfolder and run the following:

```bash
yarn lint:fix
```

To finalize the setup, you also need to change MetaMask's RPC provider. Simply go MetaMask, find the network dropdown and select `Localhost 8545`.

> Note! This assumes that `Geth` runs on `http://localhost:8545`.

[instructions]: https://github.com/raiden-network/light-client#install-and-run-the-dapp
[`createraiden`]: https://github.com/raiden-network/light-client/blob/master/raiden-dapp/src/services/raiden-service.ts#L45
[cloning]: https://raiden-network.readthedocs.io/en/latest/custom-setups/private_net_tutorial.html#install-raiden-and-dependencies
[tutorial]: https://raiden-network.readthedocs.io/en/latest/custom-setups/private_net_tutorial.html
[`blame`]: https://github.com/raiden-network/raiden/blame/develop/requirements/requirements.txt#L224
[requirements.txt]: https://github.com/raiden-network/raiden/blob/v2.0.0/requirements/requirements.txt#L204
[raiden]: https://github.com/raiden-network/raiden
[github]: https://github.com/raiden-network/light-client
[raiden on private network tutorial]: https://raiden-network.readthedocs.io/en/latest/custom-setups/private_net_tutorial.html
[sdk installation]: https://github.com/raiden-network/light-client#run-the-repository-code
[install raiden and dependencies]: https://raiden-network.readthedocs.io/en/latest/custom-setups/private_net_tutorial.html#install-raiden-and-dependencies
[raiden tags]: https://github.com/raiden-network/raiden/tags
