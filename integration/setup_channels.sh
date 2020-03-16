#!/usr/bin/env bash

source /opt/deployment/user_deposit_info.sh

synapse-entrypoint.sh &
SYNAPSE_PID=$!

echo Synapse server is running at "${SYNAPSE_PID}"

source /opt/raiden/bin/activate
echo $VIRTUAL_ENV

echo Preparing ROOMS

python3 /usr/local/bin/room_ensurer.py --own-server "${SERVER_NAME}" \
  --log-level "DEBUG" \
  --credentials-file /opt/synapse/config/admin_user_cred.json \
  -i 0

echo Starting Chain
geth --rpc --datadir ${DATA_DIR} --networkid 4321 --rpcapi "eth,net,web3,txpool" --minerthreads=1 --mine --nousb --verbosity 1 &
GETH_PID=$!

echo Start PFS
source /opt/services/venv/bin/activate
pfs-entrypoint.sh &
deactivate
PFS_PID=$!

source /opt/raiden/bin/activate

PFS_RETRIES=0
until $(curl --output /dev/null --silent --get --fail http://localhost:6000/api/v1/info); do
  if [ $PFS_RETRIES -gt 10 ]; then
    exit 1
  fi
  echo "Waiting for node 1 (${PFS_RETRIES})"
  PFS_RETRIES=$((PFS_RETRIES+1))
  sleep 20
done

echo Starting Node 1
raiden --config-file /opt/raiden/config/node1.toml \
  --no-sync-check \
  --user-deposit-contract-address "${USER_DEPOSIT_ADDRESS}" &
RAIDEN1_PID=$!

echo Starting Node 2
raiden --config-file /opt/raiden/config/node2.toml \
  --no-sync-check \
  --user-deposit-contract-address "${USER_DEPOSIT_ADDRESS}" &
RAIDEN2_PID=$!

python -m raiden_contracts.deploy verify --rpc-provider http://localhost:8545

NODE_TRIES=0
until $(curl --output /dev/null --silent --get --fail http://localhost:5001/api/v1/address); do
  if [ $NODE_TRIES -gt 10 ]; then
    echo 'Terminating'
    exit 1
  fi
  echo "Waiting for node 1 (${NODE_TRIES})"
  NODE_TRIES=$((NODE_TRIES+1))
  if [ ! -n "$(ps -p $RAIDEN1_PID -o pid=)" ]; then
    echo 'restarting'
    raiden --config-file /opt/raiden/config/node1.toml \
      --no-sync-check \
      --user-deposit-contract-address "${USER_DEPOSIT_ADDRESS}" &
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
  NODE_TRIES=$((NODE_TRIES+1))
  sleep 20
done

prepare_channel.py --token ${TTT_TOKEN_ADDRESS}

echo Preparing to terminate at "${SYNAPSE_PID}"

kill ${RAIDEN1_PID}
kill ${RAIDEN2_PID}
kill ${PFS_PID}
kill ${SYNAPSE_PID}
kill ${GETH_PID}
