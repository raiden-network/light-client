#!/usr/bin/env bash

# Notes:
#   - runs end-to-end test suite based on current working directory
#   - all arguments passed to this script get forwarded to the test command.

DOCKER_CONTAINER_NAME=lc-e2e
DEPLOYMENT_INFO_DIR=$(mktemp -d) # Use short argument syntax to support MacOS

function finish() {
  echo "Tearing down Docker container..."
  docker stop $DOCKER_CONTAINER_NAME >/dev/null 2>&1
}

set -e
trap finish EXIT

echo "Starting the Docker container..."
docker run --detach --rm \
  --name $DOCKER_CONTAINER_NAME \
  --publish 127.0.0.1:80:80 \
  --publish 127.0.0.1:6000:6000 \
  --publish 127.0.0.1:5001:5001 \
  --publish 127.0.0.1:5002:5002 \
  --publish 127.0.0.1:8545:8545 \
  raidennetwork/lightclient-e2e-environment \
  >/dev/null

echo "Getting DEPLOYMENT_INFO from docker image '$DOCKER_CONTAINER_NAME' ..."
docker cp "$DOCKER_CONTAINER_NAME":/opt/deployment/deployment_private_net.json "$DEPLOYMENT_INFO_DIR/"
docker cp "$DOCKER_CONTAINER_NAME":/opt/deployment/deployment_services_private_net.json "$DEPLOYMENT_INFO_DIR/"
docker cp "$DOCKER_CONTAINER_NAME":/etc/profile.d/smartcontracts.sh "$DEPLOYMENT_INFO_DIR/"

export DEPLOYMENT_INFO="${DEPLOYMENT_INFO_DIR}/deployment_private_net.json"
export DEPLOYMENT_SERVICES_INFO="${DEPLOYMENT_INFO_DIR}/deployment_services_private_net.json"
source "${DEPLOYMENT_INFO_DIR}/smartcontracts.sh"

echo "Run end-to-end tests for dApp..."
pnpm run test:e2e -- "$@"

echo "Getting the service logs..."
docker cp "$DOCKER_CONTAINER_NAME":/var/log/supervisor/. ./logs/
