#!/usr/bin/env bash

echo "Setting up private chain"

source "${VENV}/bin/activate"

GETH_RESULT=$(geth --datadir "${DATA_DIR}" account new --password "${PASSWORD_FILE}")

ACCOUNT=$(echo "${GETH_RESULT}" | grep -oP 'Public address of the key:\s*\K\w*')
KEYSTORE_PATH=$(echo "${GETH_RESULT}" | grep -oP 'Path of the secret key file:\s*\K[\/a-zA-Z0-9.-]*')

mkdir -p "${DEPLOYMENT_DIRECTORY}"

echo "${ACCOUNT}" > "${DEPLOYMENT_DIRECTORY}"/miner.sh
genesis.py --validator "${ACCOUNT}" --output /tmp/genesis.json
geth --datadir "${DATA_DIR}" init /tmp/genesis.json

geth --rpc --syncmode full \
  --gcmode archive \
  --datadir "${DATA_DIR}" \
  --networkid 4321 \
  --nodiscover \
  --rpc \
  --rpcapi "eth,net,web3,txpool" \
  --minerthreads=1 \
  --mine \
  --nousb \
  --unlock "${ACCOUNT}" \
  --password "${PASSWORD_FILE}" \
  --allow-insecure-unlock &

GETH_PID=$!

deploy_contracts.py --contract-version "${CONTRACTS_VERSION}" \
  --keystore-file "${KEYSTORE_PATH}" \
  --output "${SMARTCONTRACTS_ENV_FILE}" \
  --password "${PASSWORD}"

chmod u+x "${SMARTCONTRACTS_ENV_FILE}"

kill -s TERM ${GETH_PID}
