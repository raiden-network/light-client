#!/usr/bin/env bash

echo "Setting up private chain"
geth --datadir ${DATA_DIR} account new --password ${PASSWORD_FILE}
geth --datadir ${DATA_DIR} init ${GENESIS_FILE}

geth --rpc --datadir ${DATA_DIR} --networkid 4321 --rpcapi "eth,net,web3,txpool" --minerthreads=1 --mine &
GETH_PID=$!

deploy_contracts.py --keystore-file ${KEYSTORE_PATH} --password ${KEYSTORE_PASS}

kill ${GETH_PID}
