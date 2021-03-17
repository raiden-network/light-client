#!/usr/bin/env bash
# shellcheck disable=SC1090

# Notes:
#   - runs end-to-end test suite based on current working directory
#   - all arguments passed to this script get forwarded to the test command.

SHARED_SCRIPT_PATH="$(dirname "${BASH_SOURCE[0]}")/shared-script.sh"
source "$SHARED_SCRIPT_PATH"

running_inside_circleci && echo -e "\nAssuming to run in CircleCI with end-to-end environment in place!"

if [[ ! -d "$DEPLOYMENT_INFORMATION_DIRECTORY" ]]; then
  if running_inside_circleci; then
    echo -e "\nERROR: The deployment information are missing. They can't be extracted from inside CircleCI."
    exit 1
  else
    extract_deployment_information
  fi
else
  echo -e "\nWARNING: Please make sure that the local deployment information always match with the used image."
fi

if ! running_inside_circleci; then
  echo -e "\nStart the Docker container with the end-to-end environment"
  docker run --detach --rm \
    --name "$DOCKER_CONTAINER_NAME" \
    --publish 127.0.0.1:80:80 \
    --publish 127.0.0.1:5555:5555 \
    --publish 127.0.0.1:5001:5001 \
    --publish 127.0.0.1:5002:5002 \
    --publish 127.0.0.1:8545:8545 \
    "$DOCKER_IMAGE_NAME" \
    >/dev/null

fi

echo -e "\nWait to make sure all services are up and running"
sleep 5s

export DEPLOYMENT_INFO="${DEPLOYMENT_INFORMATION_DIRECTORY}/deployment_private_net.json"
export DEPLOYMENT_SERVICES_INFO="${DEPLOYMENT_INFORMATION_DIRECTORY}/deployment_services_private_net.json"
source "${DEPLOYMENT_INFORMATION_DIRECTORY}/smartcontracts.sh"

echo -e "\nRun the end-to-end tests for $( basename "$(pwd)")"
yarn run test:e2e "$@"

if ! running_inside_circleci; then
  echo -e "\nGet the log files of the run services"
  docker cp "$DOCKER_CONTAINER_NAME":/var/log/supervisor/. ./logs/
fi
