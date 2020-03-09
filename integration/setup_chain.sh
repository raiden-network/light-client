#!/usr/bin/env sh

set -e
set -x

WORK_DIR=$PWD
source ./environment.sh

if [[ ! -f "${LOCAL_BASE}/bin/geth-${OSNAME}-${GETH_VERSION}" ]];
then
    geth/download_geth.sh
fi

if [[ ! -d '.env' ]];
then
    echo 'Creating python virtuanenv'
    virtualenv -p python3.7 .env
fi
source ./.env/bin/activate

cd ../raiden-ts/raiden-contracts

pip install -r requirements.txt
pip install -e .

cd "$WORK_DIR"

if [[ ! -d '.integration-chain' ]];
then
    echo "Setting up private chain"
    echo ${KEYSTORE_PASS} > ./passwd
    geth --datadir ./.integration-chain account new --password ./passwd
    rm ./passwd
    geth --datadir ./.integration-chain init ./geth/genesis.json
fi
geth --rpc --datadir ./.integration-chain --networkid 4321 --rpcapi "eth,net,web3,txpool" --minerthreads=1 --mine &
GETH_PID=$!

geth/deploy_contracts.py --keystore-file ${KEYSTORE_PATH} --password ${KEYSTORE_PASS}

kill ${GETH_PID}
