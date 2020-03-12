#!/usr/bin/env bash

synapse-entrypoint.sh &
SYNAPSE_PID=$!

source /opt/raiden/bin/activate

echo $SERVER_NAME

python3 /usr/local/bin/room_ensurer.py --own-server "${SERVER_NAME}" \
    --log-level "DEBUG" \
    --credentials-file /opt/synapse/config/admin_user_cred.json

kill ${SYNAPSE_PID}
