/* eslint-disable @typescript-eslint/camelcase */
import ganache, { GanacheServerOptions } from 'ganache-cli';
import memdown from 'memdown';
import { range } from 'lodash';
import asyncPool from 'tiny-async-pool';

import { Web3Provider } from 'ethers/providers';
import { MaxUint256, AddressZero } from 'ethers/constants';
import { ContractFactory, Contract } from 'ethers/contract';
import { parseUnits } from 'ethers/utils';

import { ContractsInfo } from 'raiden-ts/types';
import { Address } from 'raiden-ts/utils/types';
import { TokenNetworkRegistry } from 'raiden-ts/contracts/TokenNetworkRegistry';
import { CustomToken } from 'raiden-ts/contracts/CustomToken';
import { ServiceRegistry } from 'raiden-ts/contracts/ServiceRegistry';
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

  public async mine(count = 1): Promise<number> {
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

  public async deployRegistry(): Promise<ContractsInfo> {
    const accounts = await this.listAccounts();
    const address = accounts[accounts.length - 1],
      signer = this.getSigner(address);

    const secretRegistryContract = await new ContractFactory(
      Contracts.contracts.SecretRegistry.abi,
      Contracts.contracts.SecretRegistry.bin,
      signer,
    ).deploy();
    await secretRegistryContract.deployed();

    const registryContract = (await new ContractFactory(
      Contracts.contracts.TokenNetworkRegistry.abi,
      Contracts.contracts.TokenNetworkRegistry.bin,
      signer,
    ).deploy(
      secretRegistryContract.address,
      this.network.chainId,
      20,
      555428,
      10,
    )) as TokenNetworkRegistry;
    await registryContract.deployed();
    const registryDeployBlock = registryContract.deployTransaction.blockNumber;

    // controller token for service registry
    const tokenContract = (await new ContractFactory(
      Contracts.contracts.CustomToken.abi,
      Contracts.contracts.CustomToken.bin,
      signer,
    ).deploy(parseUnits('1000000', 18), 18, `ControllerToken`, `CTK`)) as CustomToken;
    await tokenContract.deployed();

    const amount = 1e6;
    const serviceRegistryContract = (await new ContractFactory(
      Contracts.contracts.ServiceRegistry.abi,
      Contracts.contracts.ServiceRegistry.bin,
      signer,
    ).deploy(
      tokenContract.address, // token for registration
      AddressZero, // controller
      amount, // initial price, 1e-12 CTK
      6, // price bump numerator
      5, // price bump denominator
      17280000, // decay constant
      1000, // min price
      17280000, // registration duration
    )) as ServiceRegistry;
    await serviceRegistryContract.deployed();
    const serviceRegistryDeployBlock = serviceRegistryContract.deployTransaction.blockNumber;

    // mint CTK to deployer
    console.warn(
      '1',
      await (await tokenContract.functions.mintFor(parseUnits('1000', 18), address)).wait(),
    );
    // approve service registry transfering amount from deployer
    console.warn(
      '2',
      await (await tokenContract.functions.approve(
        serviceRegistryContract.address,
        amount,
      )).wait(),
    );
    await this.mine();
    // deposit amount tokens to service registry
    console.warn('3', await (await serviceRegistryContract.functions.deposit(amount)).wait());
    // setURL for service registry
    console.warn(
      '4',
      await (await serviceRegistryContract.functions.setURL('https://pfs.raiden.test')).wait(),
    );

    return {
      TokenNetworkRegistry: {
        address: registryContract.address as Address,
        block_number: registryDeployBlock!,
      },
      ServiceRegistry: {
        address: serviceRegistryContract.address as Address,
        block_number: serviceRegistryDeployBlock!,
      },
    };
  }

  public async deployTokenNetwork(
    info: ContractsInfo,
  ): Promise<{
    token: string;
    tokenNetwork: string;
  }> {
    const accounts = await this.listAccounts();
    const signer = this.getSigner(accounts[accounts.length - 1]);

    const registryContract = new Contract(
      info.TokenNetworkRegistry.address,
      Contracts.contracts.TokenNetworkRegistry.abi,
      signer,
    ) as TokenNetworkRegistry;

    const next =
      (await this.getLogs(registryContract.filters.TokenNetworkCreated(null, null))).length + 1;

    const tokenContract = await new ContractFactory(
      Contracts.contracts.CustomToken.abi,
      Contracts.contracts.CustomToken.bin,
      signer,
    ).deploy(parseUnits('1000000', 18), 18, `TestToken${next}`, `TK${next}`);
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

    return {
      token: tokenContract.address,
      tokenNetwork: tokenNetworkAddress,
    };
  }
}
