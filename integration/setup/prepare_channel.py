#!/usr/bin/env python

import click
import requests

AMOUNT = '100000000000000000000'
HEADER = {'Content-Type': 'application/json', }


def url(port: int) -> str:
    return f'http://localhost:{port}/api/v1/'


def address(port: int) -> str:
    response = requests.get(f'http://localhost:{port}/api/v1/address')
    return response.json()['our_address']


def mint(port: int, node_address: str, token: str) -> bool:
    url = f'http://localhost:{port}/api/v1/_testing/tokens/{token}/mint'
    data = {'to': node_address, 'value': AMOUNT, }
    response = requests.post(url, headers=HEADER, json=data)
    return response.status_code == 200


def open_channel(port: int, token: str, partner: str) -> bool:
    url = f'http://localhost:{port}/api/v1/channels'
    data = {
        'partner_address': partner,
        'reveal_timeout': '10',
        'settle_timeout': '20',
        'token_address': token,
        'total_deposit': AMOUNT,
    }
    response = requests.put(url, headers=HEADER, json=data)
    return response.status_code == 200


def deposit(port: int, token: str, partner: str) -> bool:
    url = f'http://localhost:{port}/api/v1/channels/{token}/{partner}'
    data = {'total_deposit': AMOUNT, }
    response = requests.patch(url, headers=HEADER, json=data)
    return response.status_code == 200


@click.command()
@click.option('--token', required=True, type=str)
def main(token: str):
    print(f'Preparing channels for token {token}')
    node1 = 5001
    node2 = 5002
    node1_address = address(node1)
    node2_address = address(node2)

    print(f'Minting tokens for {node1_address}')
    mint(node1, node1_address, token)
    print(f'Minting tokens for {node2_address}')
    mint(node2, node2_address, token)

    print(f'Opening channel from {node1_address} -> {node2_address}')
    open_channel(node1, token, node2_address)
    print(f'Depositing on channel {node2_address} -> {node1_address}')
    deposit(node2, token, node1_address)
    print('Channels ready')


if __name__ == '__main__':
    main()
