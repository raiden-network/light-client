import ganache, { GanacheServerOptions } from 'ganache-cli';
import memdown from 'memdown';

import { Web3Provider } from 'ethers/providers';
import { ContractFactory, Contract } from 'ethers/contract';
import { parseUnits } from 'ethers/utils';

import { ContractsInfo, RaidenContracts } from 'raiden/types';
import { TokenNetworkRegistry } from '../../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../../contracts/TokenNetwork';
import { Token } from '../../contracts/Token';
import Contracts from '../../contracts.json';

export class TestProvider extends Web3Provider {
  public constructor(opts?: GanacheServerOptions) {
    super(
      ganache.provider({
        total_accounts: 3, // eslint-disable-line @typescript-eslint/camelcase
        default_balance_ether: 5, // eslint-disable-line @typescript-eslint/camelcase
        seed: 'testrpc_provider',
        db: memdown(),
        ...opts,
      }),
    );
    this.pollingInterval = 10;
  }

  public snapshot(): Promise<number> {
    return this.send('evm_snapshot', null);
  }

  public revert(id: number): Promise<boolean> {
    return this.send('evm_revert', id);
  }

  public async mine(count: number = 1): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.send('evm_mine', null);
    }
  }

  public async deployRaidenContracts(): Promise<[ContractsInfo, RaidenContracts]> {
    const accounts = await this.listAccounts();
    const signer = this.getSigner(accounts.pop());

    const secretRegistryContract = await new ContractFactory(
      Contracts.contracts.SecretRegistry.abi,
      Contracts.contracts.SecretRegistry.bin,
      signer,
    ).deploy();
    await secretRegistryContract.deployed();

    const registryContract = await new ContractFactory(
      Contracts.contracts.TokenNetworkRegistry.abi,
      Contracts.contracts.TokenNetworkRegistry.bin,
      signer,
    ).deploy(secretRegistryContract.address, this.network.chainId, 500, 555428);
    await registryContract.deployed();
    const registyDeployBlock = registryContract.deployTransaction.blockNumber;

    const tokenContract = await new ContractFactory(
      Contracts.contracts.CustomToken.abi,
      Contracts.contracts.CustomToken.bin,
      signer,
    ).deploy(parseUnits('1000000', 18), 18, 'TestToken', 'TKN');
    await tokenContract.deployed();

    const decimals = await tokenContract.functions.decimals();
    const txs = await Promise.all(
      accounts.map(account =>
        tokenContract.functions.mintFor(parseUnits('1000', decimals), account),
      ),
    );
    await Promise.all(txs);

    const tx = await registryContract.functions.createERC20TokenNetwork(tokenContract.address, {
      gasPrice: 1,
      gasLimit: 6e6,
    });
    await tx.wait();

    const tokenNetworkAddress = await registryContract.functions.token_to_token_networks(
      tokenContract.address,
    );
    const tokenNetworkContract = new Contract(
      tokenNetworkAddress,
      Contracts.contracts.TokenNetwork.abi,
      signer,
    ) as TokenNetwork;

    return [
      {
        TokenNetworkRegistry: {
          address: registryContract.address,
          block_number: registyDeployBlock!, // eslint-disable-line
        },
      },
      {
        registry: registryContract as TokenNetworkRegistry,
        tokenNetworks: {
          [tokenNetworkAddress]: tokenNetworkContract,
        },
        tokens: {
          [tokenContract.address]: tokenContract as Token,
        },
      },
    ];
  }
}
