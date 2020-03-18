#!/usr/bin/env bash

source /etc/profile.d/smartcontracts.sh
MINER_ACCOUNT=$(cat /opt/deployment/miner.sh)
export MINER_ACCOUNT

/usr/bin/supervisord