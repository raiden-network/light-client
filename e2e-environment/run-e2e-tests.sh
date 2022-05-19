#!/usr/bin/env bash
# shellcheck disable=SC1090

# Notes:
#   - runs end-to-end test suite based on current working directory
#   - all arguments passed to this script get forwarded to the test command.

SHARED_SCRIPT_PATH="$(dirname "${BASH_SOURCE[0]}")/shared-script.sh"
source "$SHARED_SCRIPT_PATH"

verify_deployment_information

if running_inside_circleci; then
  echo -e "\nAssume for the following to run in CircleCI with end-to-end environment already in place!"
else
  echo -e "\nStart the Docker container with the end-to-end environment"
  docker run --detach --rm \
    --name "$DOCKER_CONTAINER_NAME" \
    --publish 127.0.0.1:9080:9080 \
    --publish 127.0.0.1:5555:5555 \
    --publish 127.0.0.1:5001:5001 \
    --publish 127.0.0.1:5002:5002 \
    --publish 127.0.0.1:8545:8545 \
    --volume $(dirname "${BASH_SOURCE[0]}")/supervisord.conf:/etc/supervisor/conf.d/supervisord.conf \
    "$DOCKER_IMAGE_NAME" \
    >/dev/null
fi

echo -e "\nWait to make sure all services are up and running"
sleep 10s

export DEPLOYMENT_INFO="${DEPLOYMENT_INFORMATION_DIRECTORY}/deployment_private_net.json"
export DEPLOYMENT_SERVICES_INFO="${DEPLOYMENT_INFORMATION_DIRECTORY}/deployment_services_private_net.json"
source "${DEPLOYMENT_INFORMATION_DIRECTORY}/smartcontracts.sh"

echo -e "\nRun the end-to-end tests for $( basename "$(pwd)")"
yarn run test:e2e "$@"
