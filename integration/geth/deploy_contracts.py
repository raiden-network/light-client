#!/usr/bin/env python
import json
import os

import click
from eth_account import Account
from raiden_contracts.constants import CONTRACT_TOKEN_NETWORK_REGISTRY, CONTRACT_USER_DEPOSIT, \
    CONTRACT_ONE_TO_N
from raiden_contracts.deploy.__main__ import (
    ContractDeployer,
)
from web3 import HTTPProvider, Web3
from web3.middleware import geth_poa_middleware

TOKEN_DECIMALS = 18
TOKEN_SUPPLY = 10_000_000

GAS_LIMIT = 6_000_000
GAS_PRICE = 10

UNLIMITED = 115792089237316195423570985008687907853269984665640564039457584007913129639935

SETTLE_TIMEOUT_MIN = 20
SETTLE_TIMEOUT_MAX = 555_428

SERVICE_DEPOSIT_BUMP_NUMERATOR = 6
SERVICE_DEPOSIT_BUMP_DENOMINATOR = 5
SERVICE_DEPOSIT_DECAY_CONSTANT = 17_280_000
INITIAL_SERVICE_DEPOSIT_PRICE = 2_000_000_000_000_000_000_000
SERVICE_DEPOSIT_MIN_PRICE = 1_000
SERVICE_REGISTRATION_DURATION = 17_280_000


@click.command()
@click.option("--keystore-file", required=True, type=click.Path(exists=True, dir_okay=False))
@click.option("--contract-version", default='0.36.0')
@click.password_option(
    "--password",
    envvar="ACCOUNT_PASSWORD",
    confirmation_prompt=False,
)
@click.option("--rpc-url", default="http://localhost:8545")
def main(keystore_file: str, contract_version: str, password: str, rpc_url: str):
    web3 = Web3(HTTPProvider(rpc_url, request_kwargs={'timeout': 60}))
    web3.middleware_stack.inject(geth_poa_middleware, layer=0)

    with open(keystore_file, 'r') as keystore:
        encrypted_key = keystore.read()
        private_key = web3.eth.account.decrypt(encrypted_key, password)
        account = Account.privateKeyToAccount(private_key)

    if private_key is None:
        print('No private key found')
        exit(1)

    owner = account.address

    if web3.eth.getBalance(owner) == 0:
        print('Account with insuficient funds.')
        exit(1)

    print(f'Deploying contracts on behalf of {owner}')

    deployer = ContractDeployer(
        web3=web3,
        private_key=private_key,
        gas_limit=GAS_LIMIT,
        gas_price=GAS_PRICE,
        wait=120,
        contracts_version=contract_version,
    )

    print('Deploying Raiden contracts')
    deployed_contracts_info = deployer.deploy_raiden_contracts(
        max_num_of_token_networks=UNLIMITED,
        settle_timeout_min=SETTLE_TIMEOUT_MIN,
        settle_timeout_max=SETTLE_TIMEOUT_MAX,
        reuse_secret_registry_from_deploy_file=None
    )

    deployed_contracts = {
        contract_name: info['address']
        for contract_name, info in deployed_contracts_info['contracts'].items()
    }

    deployer.store_and_verify_deployment_info_raiden(
        deployed_contracts_info=deployed_contracts_info
    )

    token_network_registry_address = deployed_contracts[CONTRACT_TOKEN_NETWORK_REGISTRY]
    print(f'Registry contract deployed @ {token_network_registry_address}')

    print('Deploying TTT contract')
    ttt_abi, ttt_token_address = deploy_token(deployer)
    print(f'Deployed TTT contract @ {ttt_token_address}')

    print('Registering TTT')
    deployer.register_token_network(
        token_registry_abi=ttt_abi,
        token_registry_address=token_network_registry_address,
        token_address=ttt_token_address,
        channel_participant_deposit_limit=UNLIMITED,
        token_network_deposit_limit=UNLIMITED,
    )

    print('Deploying SVT contract')
    svt_abi, svt_token_address = deploy_token(deployer, 'ServiceToken', 'SVT')
    print(f'Deployed SVT contract @ {svt_token_address}')

    print('Deploying Raiden service contracts')
    deployed_service_contracts_info = deployer.deploy_service_contracts(
        token_address=svt_token_address,
        user_deposit_whole_balance_limit=UNLIMITED,
        service_registry_controller=owner,
        initial_service_deposit_price=INITIAL_SERVICE_DEPOSIT_PRICE,
        service_deposit_bump_numerator=SERVICE_DEPOSIT_BUMP_NUMERATOR,
        service_deposit_bump_denominator=SERVICE_DEPOSIT_BUMP_DENOMINATOR,
        decay_constant=SERVICE_DEPOSIT_DECAY_CONSTANT,
        min_price=SERVICE_DEPOSIT_MIN_PRICE,
        registration_duration=SERVICE_REGISTRATION_DURATION,
        token_network_registry_address=token_network_registry_address
    )

    deployer.store_and_verify_deployment_info_services(
        deployed_contracts_info=deployed_service_contracts_info,
        token_address=svt_token_address,
        user_deposit_whole_balance_limit=UNLIMITED,
        token_network_registry_address=token_network_registry_address,
    )

    if os.path.exists("user_deposit_address"):
        os.remove("user_deposit_address")

    with open('user_deposit_info.sh', 'w+') as address_file:
        contracts_info = deployed_service_contracts_info['contracts']
        user_deposit_address = contracts_info[CONTRACT_USER_DEPOSIT]['address']
        one_to_n_address = contracts_info[CONTRACT_ONE_TO_N]['address']
        address_file.write(f'export USER_DEPOSIT_ADDRESS={user_deposit_address}\n')
        address_file.write(f'export TOKEN_NETWORK_REGISTRY_ADDRESS={token_network_registry_address}\n')
        address_file.write(f'export TOKEN_NETWORK_REGISTRY_ADDRESS={token_network_registry_address}\n')
        address_file.write(f'export ONE_TO_N_ADDRESS={one_to_n_address}\n')
        address_file.close()

    print('done')


def deploy_token(deployer: ContractDeployer, name: str = 'TestToken', symbol: str = 'TTT'):
    tokens = TOKEN_SUPPLY * (10 ** TOKEN_DECIMALS)
    deployed_token = deployer.deploy_token_contract(tokens, TOKEN_DECIMALS, name, symbol)
    abi = deployer.contract_manager.get_contract_abi(CONTRACT_TOKEN_NETWORK_REGISTRY)
    token_address = deployed_token['CustomToken']
    return abi, token_address


if __name__ == '__main__':
    main()
