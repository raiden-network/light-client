#!/usr/bin/env bash

INTEGRATION_CONTAINER=lc-integration

echo Starting the image
docker run --name "${INTEGRATION_CONTAINER}" -d -p 80:80 -p 6000:6000 -p 5001:5001 -p 5002:5002 -p 8545:8545 lightclient-integration
source ./pull_deployment.sh "${INTEGRATION_CONTAINER}"
cd ../raiden-ts || exit

npm run test:integration

docker stop lc-integration
docker rm lc-integration