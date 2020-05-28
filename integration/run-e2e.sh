#!/usr/bin/env bash

param="$1"

INTEGRATION_CONTAINER=lc-integration
WORKING_DIR=$PWD

echo Starting the image
docker run --name "${INTEGRATION_CONTAINER}" -d \
  -p 127.0.0.1:80:80 \
  -p 127.0.0.1:6000:6000 \
  -p 127.0.0.1:5001:5001 \
  -p 127.0.0.1:5002:5002 \
  -p 127.0.0.1:8545:8545 lightclient-integration

source ./pull_deployment.sh "${INTEGRATION_CONTAINER}"
cd ../raiden-dapp || exit 1

npm run test:e2e

if [[ "${param}" == DEBUG ]]; then
  echo "Getting service logs from docker image ${INTEGRATION_CONTAINER}"
  docker cp "${INTEGRATION_CONTAINER}":/var/log/supervisor/. "${WORKING_DIR}"/logs/
fi

docker stop lc-integration
docker rm lc-integration
