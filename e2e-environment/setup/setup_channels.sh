#!/usr/bin/env bash

source "${SMARTCONTRACTS_ENV_FILE}"

echo Starting Chain
ACCOUNT=$(cat /opt/deployment/miner.sh)

geth --syncmode full --gcmode archive --datadir "${DATA_DIR}" \
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

source ${SERVICES_VENV}/bin/activate
python3 -m raiden_libs.service_registry register \
  --log-level DEBUG \
  --keystore-file /opt/services/keystore/UTC--2020-03-11T15-39-16.935381228Z--2b5e1928c25c5a326dbb61fc9713876dd2904e34 \
  --password 1234 \
  --eth-rpc "http://localhost:8545" \
  --accept-all \
  --service-url "http://test.rsb"
deactivate

synapse-entrypoint.sh &
SYNAPSE_PID=$!

echo Synapse server is running at "${SYNAPSE_PID}"

echo Start PFS
source ${SERVICES_VENV}/bin/activate
pfs-entrypoint.sh &
deactivate
PFS_PID=$!

source ${CONTRACTS_VENV}/bin/activate
python -m raiden_contracts.deploy verify --rpc-provider http://localhost:8545 --contracts-version ${CONTRACTS_VERSION}

PFS_RETRIES=0
until $(curl --output /dev/null --silent --get --fail http://localhost:5555/api/v1/info); do
  if [ $PFS_RETRIES -gt 10 ]; then
    exit 1
  fi
  echo "Waiting for Pathfinding service to start (${PFS_RETRIES})"
  PFS_RETRIES=$((PFS_RETRIES + 1))

  sleep 20
done

echo Starting Node 1
/opt/raiden/raiden --keystore-path /opt/raiden/config/keys --data-dir /opt/raiden/data  --password-file /opt/raiden/config/passwd --eth-rpc-endpoint http://localhost:8545 --accept-disclaimer true --api-address 0.0.0.0:5001 --default-reveal-timeout 20 --default-settle-timeout 40 --routing-mode pfs --pathfinding-service-address http://localhost:5555 --matrix-server http://localhost:9080 --address "0x517aAD51D0e9BbeF3c64803F86b3B9136641D9ec" --log-file = /var/log/supervisor/node1.log --user-deposit-contract-address "${USER_DEPOSIT_ADDRESS}" &
RAIDEN1_PID=$!

echo Starting Node 2
/opt/raiden/raiden --keystore-path /opt/raiden/config/keys --data-dir /opt/raiden/data  --password-file /opt/raiden/config/passwd --eth-rpc-endpoint http://localhost:8545 --accept-disclaimer true --api-address 0.0.0.0:5002 --routing-mode pfs --pathfinding-service-address http://localhost:5555 --matrix-server http://localhost:9080 --address "0xCBC49ec22c93DB69c78348C90cd03A323267db86" --log-file /var/log/supervisor/node2.log --default-reveal-timeout 20 --default-settle-timeout 40 --user-deposit-contract-address "${USER_DEPOSIT_ADDRESS}" &
RAIDEN2_PID=$!

NODE_TRIES=0
until $(curl --output /dev/null --silent --get --fail http://localhost:5001/api/v1/address); do
  if [ $NODE_TRIES -gt 10 ]; then
    echo 'Terminating'
    exit 1
  fi
  echo "Waiting for node 1 (${NODE_TRIES})"
  NODE_TRIES=$((NODE_TRIES + 1))
  if [ ! -n "$(ps -p $RAIDEN1_PID -o pid=)" ]; then
    echo 'restarting'
    /opt/raiden/raiden --keystore-path /opt/raiden/config/keys --data-dir /opt/raiden/data  --password-file /opt/raiden/config/passwd --eth-rpc-endpoint http://localhost:8545 --accept-disclaimer true --api-address 0.0.0.0:5001 --routing-mode pfs --pathfinding-service-address http://localhost:5555 --matrix-server http://localhost:9080 --address "0x517aAD51D0e9BbeF3c64803F86b3B9136641D9ec" --log-file /var/log/supervisor/node1.log.json --default-reveal-timeout 20 --default-settle-timeout 40 --user-deposit-contract-address "${USER_DEPOSIT_ADDRESS}" &
    RAIDEN1_PID=$!
  fi
  sleep 20
done

NODE_TRIES=0
until $(curl --output /dev/null --silent --get --fail http://localhost:5002/api/v1/address); do
  if [ $NODE_TRIES -gt 10 ]; then
    exit 1
  fi
  echo "Waiting for node 2 (${NODE_TRIES})"
  NODE_TRIES=$((NODE_TRIES + 1))
  sleep 20
done

pip install click requests
prepare_channel.py --token "${TTT_TOKEN_ADDRESS}"

echo Preparing to terminate at "${SYNAPSE_PID}"

kill -s TERM ${RAIDEN1_PID}
kill -s TERM ${RAIDEN2_PID}
kill -s TERM ${PFS_PID}
kill -s TERM ${SYNAPSE_PID}
kill -s TERM ${GETH_PID}
