/* eslint-disable @typescript-eslint/camelcase */
import ganache, { GanacheServerOptions } from 'ganache-cli';
import memdown from 'memdown';
import { range } from 'lodash';
import asyncPool from 'tiny-async-pool';

import { Web3Provider } from 'ethers/providers';
import { MaxUint256 } from 'ethers/constants';
import { ContractFactory, Contract } from 'ethers/contract';
import { parseUnits } from 'ethers/utils';

import { ContractsInfo, RaidenContracts } from 'raiden-ts/types';
import { Address } from 'raiden-ts/utils/types';
import { TokenNetworkRegistry } from '../../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../../contracts/TokenNetwork';
import { HumanStandardToken } from '../../contracts/HumanStandardToken';
import Contracts from '../../raiden-contracts/raiden_contracts/data/contracts.json';

export class TestProvider extends Web3Provider {
  public constructor(opts?: GanacheServerOptions) {
    super(
      ganache.provider({
        total_accounts: 3,
        default_balance_ether: 5,
        seed: 'testrpc_provider',
        network_id: 1338,
        db: memdown(),
        // logger: console,
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

  public async mine(count: number = 1): Promise<number> {
    const blockNumber = await this.getBlockNumber();
    console.debug(`mining ${count} blocks after blockNumber=${blockNumber}`);
    const promise = new Promise(resolve => {
      const cb = (b: number): void => {
        if (b < blockNumber + count) return;
        this.removeListener('block', cb);
        resolve();
      };
      this.on('block', cb);
    });
    await asyncPool(10, range(count), () => this.send('evm_mine', null));
    await promise;
    return this.blockNumber;
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
    ).deploy(secretRegistryContract.address, this.network.chainId, 500, 555428, 1);
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

    const tx = await registryContract.functions.createERC20TokenNetwork(
      tokenContract.address,
      MaxUint256,
      MaxUint256,
      { gasLimit: 6e6 },
    );
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
          address: registryContract.address as Address,
          block_number: registyDeployBlock!, // eslint-disable-line
        },
      },
      {
        registry: registryContract as TokenNetworkRegistry,
        tokenNetworks: {
          [tokenNetworkAddress]: tokenNetworkContract,
        },
        tokens: {
          [tokenContract.address]: tokenContract as HumanStandardToken,
        },
      },
    ];
  }
}
