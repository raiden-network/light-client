/* eslint-disable @typescript-eslint/camelcase */
import ganache, { GanacheServerOptions } from 'ganache-cli';
import memdown from 'memdown';
import { range } from 'lodash';
import asyncPool from 'tiny-async-pool';
import log from 'loglevel';

import { Web3Provider, AsyncSendable } from 'ethers/providers';
import { MaxUint256, AddressZero } from 'ethers/constants';
import { ContractFactory } from 'ethers/contract';
import { parseUnits, ParamType } from 'ethers/utils';

import { ContractsInfo } from 'raiden-ts/types';
import { Address } from 'raiden-ts/utils/types';
import { TokenNetworkRegistry } from 'raiden-ts/contracts/TokenNetworkRegistry';
import { CustomToken } from 'raiden-ts/contracts/CustomToken';
import { ServiceRegistry } from 'raiden-ts/contracts/ServiceRegistry';
import { TokenNetworkRegistryFactory } from 'raiden-ts/contracts/TokenNetworkRegistryFactory';
import { UserDeposit } from 'raiden-ts/contracts/UserDeposit';
import { SecretRegistry } from 'raiden-ts/contracts/SecretRegistry';
import Contracts from '../../raiden-contracts/raiden_contracts/data/contracts.json';
import { MonitoringService } from 'raiden-ts/contracts/MonitoringService';

export class TestProvider extends Web3Provider {
  public constructor(web3?: AsyncSendable, opts?: GanacheServerOptions) {
    super(
      web3 ??
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
    log.debug(`mining ${count} blocks after blockNumber=${blockNumber}`);
    const promise = new Promise<number>((resolve) => {
      const cb = (b: number): void => {
        if (b < blockNumber + count) return;
        this.removeListener('block', cb);
        resolve(b);
      };
      this.on('block', cb);
    });
    asyncPool(10, range(count), () => this.send('evm_mine', null));
    return promise;
  }

  public async mineUntil(block: number): Promise<number> {
    const blockNumber = await this.getBlockNumber();
    block = Math.max(block, blockNumber + 1);
    log.debug(`mining until block=${block} from ${blockNumber}`);
    const promise = new Promise<number>((resolve) => {
      const cb = (b: number): void => {
        if (b < block) return;
        this.removeListener('block', cb);
        resolve(b);
      };
      this.on('block', cb);
    });
    asyncPool(10, range(block - blockNumber), () => this.send('evm_mine', null));
    return promise;
  }

  public async deployRegistry(): Promise<ContractsInfo> {
    const accounts = await this.listAccounts();
    const address = accounts[accounts.length - 1],
      signer = this.getSigner(address);

    const secretRegistryContract = (await new ContractFactory(
      Contracts.contracts.SecretRegistry.abi as ParamType[],
      Contracts.contracts.SecretRegistry.bin,
      signer,
    ).deploy()) as SecretRegistry;
    await secretRegistryContract.deployed();
    const secretRegistryDeployBlock = secretRegistryContract.deployTransaction.blockNumber;

    const registryContract = (await new ContractFactory(
      Contracts.contracts.TokenNetworkRegistry.abi as ParamType[],
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
      Contracts.contracts.CustomToken.abi as ParamType[],
      Contracts.contracts.CustomToken.bin,
      signer,
    ).deploy(parseUnits('1000000', 18), 18, `ControllerToken`, `CTK`)) as CustomToken;
    await tokenContract.deployed();

    const amount = 1e6;
    const serviceRegistryContract = (await new ContractFactory(
      Contracts.contracts.ServiceRegistry.abi as ParamType[],
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
    await (await tokenContract.functions.mintFor(parseUnits('1000', 18), address)).wait();
    // approve service registry transfering amount from deployer
    await (await tokenContract.functions.approve(serviceRegistryContract.address, amount)).wait();
    await this.mine();
    // deposit amount tokens to service registry
    await (await serviceRegistryContract.functions.deposit(amount)).wait();
    // setURL for service registry
    await (await serviceRegistryContract.functions.setURL('https://pfs.raiden.test')).wait();

    const userDepositContract = (await new ContractFactory(
      Contracts.contracts.UserDeposit.abi,
      Contracts.contracts.UserDeposit.bin,
      signer,
    ).deploy(tokenContract.address, 1e10)) as UserDeposit;
    await userDepositContract.deployed();
    const userDepositDeployBlock = userDepositContract.deployTransaction.blockNumber;

    const monitoringServiceContract = (await new ContractFactory(
      Contracts.contracts.MonitoringService.abi,
      Contracts.contracts.MonitoringService.bin,
      signer,
    ).deploy(
      tokenContract.address,
      serviceRegistryContract.address,
      userDepositContract.address,
      registryContract.address,
    )) as MonitoringService;
    await monitoringServiceContract.deployed();
    const monitoringServiceDeployBlock = monitoringServiceContract.deployTransaction.blockNumber;

    return {
      TokenNetworkRegistry: {
        address: registryContract.address as Address,
        block_number: registryDeployBlock!,
      },
      ServiceRegistry: {
        address: serviceRegistryContract.address as Address,
        block_number: serviceRegistryDeployBlock!,
      },
      UserDeposit: {
        address: userDepositContract.address as Address,
        block_number: userDepositDeployBlock!,
      },
      SecretRegistry: {
        address: secretRegistryContract.address as Address,
        block_number: secretRegistryDeployBlock!,
      },
      MonitoringService: {
        address: monitoringServiceContract.address as Address,
        block_number: monitoringServiceDeployBlock!,
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

    const registryContract = TokenNetworkRegistryFactory.connect(
      info.TokenNetworkRegistry.address,
      signer,
    );

    const next =
      (await this.getLogs(registryContract.filters.TokenNetworkCreated(null, null))).length + 1;

    const tokenContract = (await new ContractFactory(
      Contracts.contracts.CustomToken.abi,
      Contracts.contracts.CustomToken.bin,
      signer,
    ).deploy(parseUnits('1000000', 18), 18, `TestToken${next}`, `TK${next}`)) as CustomToken;
    await tokenContract.deployed();

    const decimals = await tokenContract.functions.decimals();
    const txs = await Promise.all(
      accounts.map((account) =>
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
