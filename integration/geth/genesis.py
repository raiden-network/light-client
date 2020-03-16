#!/usr/bin/env python

import json
from pathlib import Path
from typing import Dict

import click

GENESIS_STUB: Dict = {
    "config": {
        "chainId": 4321,
        "homesteadBlock": 0,
        "eip150Block": 0,
        "eip155Block": 0,
        "eip158Block": 0,
        "ByzantiumBlock": 0,
        "eip150Hash": "0x0000000000000000000000000000000000000000000000000000000000000000",
        "ConstantinopleBlock": 0,
        "PetersburgBlock": 0,
        "clique": {
            "period": 5,
            "epoch": 30000,
            "validators": []
        }
    },
    "alloc": {
        "0xCBC49ec22c93DB69c78348C90cd03A323267db86": {
            "balance": "100000000000000000000000"
        },
        "0x517aAD51D0e9BbeF3c64803F86b3B9136641D9ec": {
            "balance": "100000000000000000000000"
        }
    },
    "coinbase": "0x0000000000000000000000000000000000000000",
    "difficulty": "1",
    "mixHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "nonce": "0",
    "gasLimit": "0x9880000"
}


@click.command()
@click.option('--validator', required=True, type=str)
@click.option('--output', required=True, type=click.Path(), default="genesis.json")
def main(validator: str, output: str):
    GENESIS_STUB['config']['clique']['validators'].append(validator)
    signer = validator.lower().replace('0x', '')
    GENESIS_STUB[
        'extraData'
    ] = f'0x0000000000000000000000000000000000000000000000000000000000000000{signer}0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
    output_file = Path(output)
    output_file.write_text(json.dumps(GENESIS_STUB, indent=2))


if __name__ == '__main__':
    main()
