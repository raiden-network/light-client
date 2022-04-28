#!/usr/bin/env bash

echo "Setting up private chain"

# Setting up a virtual environment for the raiden contracts
. ${CONTRACTS_VENV}/bin/activate
pip install -U pip wheel
pip install mypy_extensions click>=7.0 eth_account web3

GETH_RESULT=$(geth --datadir "${DATA_DIR}" account new --password "${PASSWORD_FILE}")

ACCOUNT=$(echo "${GETH_RESULT}" | grep -oP 'Public address of the key:\s*\K\w*')
KEYSTORE_PATH=$(echo "${GETH_RESULT}" | grep -oP 'Path of the secret key file:\s*\K[\/a-zA-Z0-9.-]*')

mkdir -p "${DEPLOYMENT_DIRECTORY}"

echo "${ACCOUNT}" > "${DEPLOYMENT_DIRECTORY}"/miner.sh
genesis.py --validator "${ACCOUNT}" --output /tmp/genesis.json
geth --datadir "${DATA_DIR}" init /tmp/genesis.json

geth --syncmode full \
  --gcmode archive \
  --datadir "${DATA_DIR}" \
  --networkid 4321 \
  --nodiscover \
  --http \
  --http.api "eth,net,web3,txpool" \
  --miner.threads 1 \
  --mine \
  --unlock "${ACCOUNT}" \
  --password "${PASSWORD_FILE}" \
  --allow-insecure-unlock &

GETH_PID=$!

deploy_contracts.py --contract-version "${CONTRACTS_VERSION}" \
  --keystore-file "${KEYSTORE_PATH}" \
  --output "${SMARTCONTRACTS_ENV_FILE}" \
  --password "${PASSWORD}"

if [[ -f ${SMARTCONTRACTS_ENV_FILE} ]]; then
  cp ${CONTRACTS_VENV}/lib/python3.9/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_private_net.json ${DEPLOYMENT_DIRECTORY}
  cp ${CONTRACTS_VENV}/lib/python3.9/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_services_private_net.json ${DEPLOYMENT_DIRECTORY}

  if [[ ! -f ${DEPLOYMENT_DIRECTORY}/deployment_private_net.json ]]; then
    echo 'Could not find the deployment_private_net.json'
    exit 1
  fi

  if [[ ! -f ${DEPLOYMENT_DIRECTORY}/deployment_services_private_net.json ]]; then
    echo 'Could not find the deployment_services_private_net.json'
    exit 1
  fi

  chmod u+x "${SMARTCONTRACTS_ENV_FILE}"
  echo 'Deployment was successful'
  kill -s TERM ${GETH_PID}

  exit 0
else
  echo 'Deployment failed'
  kill -s TERM ${GETH_PID}
  exit 1
fi
