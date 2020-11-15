# Using the Light Client in different network setups

## Table of Contents
- [Preface](#preface)
- [Setting up the Light Client on a private network](#setting-up-the-light-client-on-a-private-network)
  * [Identifying the correct smart contract version](#identifying-the-correct-smart-contract-version)
  * [Locate the smart contract version](#locate-the-smart-contract-version)
- [Setting up the Development Environment](#setting-up-the-development-environment)
  * [Locating the Smart Contracts](#locating-the-smart-contracts)
  * [Starting the SDK](#starting-the-sdk)
  * [Changing the dApp to work on the private setup](#changing-the-dapp-to-work-on-the-private-setup)

## Preface
This guide targets users that want to use the Light Client SDK or dApp with a custom network setup. This includes private chain deployments of the Raiden Network or unsupported networks (e.g., Kovan).

To use a private network you first have to deploy the contracts by hand.
Start by following this tutorial on how to deploy and run Raiden Network on a private chain:
- [Raiden on Private Network Tutorial] 

After finishing the guide above you should have a running Raiden node along with a private chain with the Raiden Network smart contracts deployed. Now you can move on to setting up the Light Client on your private network.

## Setting up the Light Client on a private network
### Identifying the correct smart contract version
Before starting your private network setup, you first need to:
1. Select which version of the Light Client you want to use
2. Locate the version of the smart contracts used in that specific version of the Light Client

### Locate the smart contract version

You can easily find out the version of the smart contracts used in your version of the Light Client by checking the `raiden-contracts` submodule in the Light Client GitHub repo.
1. Navigate to the [GitHub] project page
2. Locate the `raiden-ts` subdirectory and look for the `raiden-contracts` submodule *(something like`raiden-contracts @ dfc0da6`)*
3. Look at the commit message and check if it includes the `raiden-contracts` version. If not, follow the submodule link to the contracts repository and locate the `setup.py` file. You'll find the version of the Raiden Contracts by looking at the version variable *(`VERSION = '0.33.3'`)*

After finding the `contracts` version you'll have to go to the [Raiden] repo and locate a version of the python client compatible with your specific version of the smart contracts.
1. Navigate to the [requirements.txt] in the `requirements` folder on the Raiden repo `develop` branch
2. You can see the `contracts` version used by looking at the `raiden-contracts` dependency.

If the python client uses a newer version of the Raiden Contracts, you can use the [`Blame`] interface to find a commit with the correct version. By clicking the `View blame prior to this change` icon button in the `Blame` interface *(The icon displayed before the line number)* you can go through the commits until you locate a commit that matches the correct version.
 
## Setting up the Development Environment
You need to check out the correct branch or tag in the Raiden repo that you cloned when deploying Raiden Network on a private chain.

For example, if you need to you the `v0.200.0-rc2` tag, you need to first checkout the tag before continuing with the tutorial.

```bash
git checkout v0.200.0-rc2
```

If you've done everything correctly you should now have `Geth` running a private chain, with the Raiden contracts deployed, and a Raiden node running.

### Locating the Smart contracts
After bootstrapping the network you have to locate the deployment files. The deployment files will point the SDK to the correct smart contracts.

Locate `env/lib/python3.7/site-packages/raiden_contracts/data_${VERSION}/`, in the directory that contains the virtual environment that you created when deploying the Raiden Network on a private chain.

You should find the two following files in this directory:

 * `deployment_private_net.json`
 * `deployment_services_private_net.json`

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
    const contractsInfo = ({
      ...privateDeployment.contracts,
      ...privateServicesDeployment.contracts
    } as unknown) as ContractsInfo;

    const raiden = await Raiden.create(
        provider,
        0,
        window.localStorage,
        contractsInfo
    );
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
import { ContractsInfo } from 'raiden-ts';
```

Then you need to construct the `contractsInfo` object. 

The [`createRaiden`] function should look like the example below:

```typescript
  private static async createRaiden(
    provider: any,
    account: string | number = 0
  ): Promise<Raiden> {
    const contractsInfo = ({
      ...privateDeployment.contracts,
      ...privateServicesDeployment.contracts
    } as unknown) as ContractsInfo;
    try {
      return await Raiden.create(
        provider,
        account,
        window.localStorage,
        contractsInfo,
        { pfsSafetyMargin: 1.1 }
      );
    } catch (e) {
      throw new RaidenInitializationFailed(e);
    }
  }
```

To finalize the setup, you also need to change MetaMask's RPC provider. Simply go MetaMask, find the network dropdown and select `Localhost 8545`. 

> Note! This assumes that `Geth` runs on `http://localhost:8545`.

[instructions]: ../installing-dapp/README.md
[`createRaiden`]: https://github.com/raiden-network/light-client/blob/3c2df8e496f329fac6f8b0ceafd4edaf40c1b736/raiden-dapp/src/services/raiden-service.ts#L18
[cloning]: https://raiden-network.readthedocs.io/en/latest/private_net_tutorial.html#install-raiden-and-dependencies
[tutorial]: https://raiden-network.readthedocs.io/en/latest/private_net_tutorial.html
[`Blame`]: https://github.com/raiden-network/raiden/blame/81e535808f6f4d047495b76a555f623d3a6838f0/requirements/requirements.txt#L66
[requirements.txt]: https://github.com/raiden-network/raiden/blob/develop/requirements/requirements.txt#L66
[Raiden]: https://github.com/raiden-network/raiden
[GitHub]: https://github.com/raiden-network/light-client
[Raiden on Private Network Tutorial]: https://raiden-network.readthedocs.io/en/latest/private_net_tutorial.html
[SDK installation]: ../installing-sdk/README.md
