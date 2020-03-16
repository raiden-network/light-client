#!/usr/bin/env bash

echo "Setting up private chain"
ACCOUNT=$(geth --datadir ${DATA_DIR} account new --password ${PASSWORD_FILE} | grep -oP 'Public address of the key:\s*\K\w*')
genesis.py --validator "${ACCOUNT}" --output /tmp/genesis.json
geth --datadir ${DATA_DIR} init /tmp/genesis.json

geth --rpc --datadir ${DATA_DIR} --networkid 4321 --rpcapi "eth,net,web3,txpool" --minerthreads=1 --mine --nousb --unlock "${ACCOUNT}" --password "${PASSWORD_FILE}" --allow-insecure-unlock --verbosity 1 &
GETH_PID=$!

deploy_contracts.py --keystore-file ${KEYSTORE_PATH} --password ${KEYSTORE_PASS}

kill ${GETH_PID}
