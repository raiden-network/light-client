#!/usr/bin/env bash

# This script includes shared variables, functions and shell settings for all
# script related to the end-to-end environment. It is meant to be sourced at the
# very beginning of each script.

DOCKER_IMAGE_REPOSITORY="raidennetwork/lightclient-e2e-environment"
DOCKER_IMAGE_TAG="v1.6.0"
DOCKER_IMAGE_NAME="${DOCKER_IMAGE_REPOSITORY}:${DOCKER_IMAGE_TAG}"
DOCKER_CONTAINER_NAME="lc-e2e"
E2E_ENVIRONMENT_DIRECTORY="$(realpath "$(dirname "${BASH_SOURCE[0]}")")"
DEPLOYMENT_INFORMATION_DIRECTORY="${E2E_ENVIRONMENT_DIRECTORY}/deployment_information"
DEPLOYMENT_INFORMATION_VERSION_FILE="${DEPLOYMENT_INFORMATION_DIRECTORY}/version"

function finish() {
  echo -e "\nGet the log files of the run services"
  docker cp "$DOCKER_CONTAINER_NAME":/var/log/supervisor/. ./logs/ || true
  echo -e "\nShut down the Docker container"
  docker stop "$DOCKER_CONTAINER_NAME" >/dev/null 2>&1 || true
}

function docker_image_exists_locally() {
  local localImages
  localImages=$(docker image ls --format '{{ .Repository }}:{{ .Tag }}')
  grep --quiet "$DOCKER_IMAGE_NAME" <<< "$localImages"
}

function extract_deployment_information() {
  echo -e "\nExtract deployment information from Docker image"

  # Use short-forms here to be compatible with macOS' BSD-based tools
  rm -rf "$DEPLOYMENT_INFORMATION_DIRECTORY"
  mkdir -p "$DEPLOYMENT_INFORMATION_DIRECTORY"

  docker run --detach --rm --name "$DOCKER_CONTAINER_NAME" "$DOCKER_IMAGE_NAME" >/dev/null
  sleep 5s

  docker cp "${DOCKER_CONTAINER_NAME}:/opt/deployment/deployment_private_net.json" "${DEPLOYMENT_INFORMATION_DIRECTORY}/"
  docker cp "${DOCKER_CONTAINER_NAME}:/opt/deployment/deployment_services_private_net.json" "${DEPLOYMENT_INFORMATION_DIRECTORY}/"
  docker cp "${DOCKER_CONTAINER_NAME}:/etc/profile.d/smartcontracts.sh" "${DEPLOYMENT_INFORMATION_DIRECTORY}/"

  docker stop "$DOCKER_CONTAINER_NAME" >/dev/null

  echo "$DOCKER_IMAGE_TAG" > "$DEPLOYMENT_INFORMATION_VERSION_FILE"
}

function running_inside_circleci() {
  # All our CircleCI executor use Docker. The assumption is that if the Docker
  # socket (at its default location) does not exist we are inside CircleCI.
  test ! -e /var/run/docker.sock
}

function verify_deployment_information() {
  if [[ ! -d "$DEPLOYMENT_INFORMATION_DIRECTORY" ]]; then
    echo "ERROR: The deployment information files for the end-to-end environment are missing!"
    exit 1
  fi

  local deployment_info_version
  deployment_info_version=$(cat "$DEPLOYMENT_INFORMATION_VERSION_FILE" || echo 'unknown')

  if [[ "$DOCKER_IMAGE_TAG" != "$deployment_info_version" ]]; then
    echo "ERROR: The local deployment information files are from a different version!"
    echo "Expected to be '$DOCKER_IMAGE_TAG' but is '$deployment_info_version'"
    echo "Please pull the latest version control changes of this branch or make sure the selected version is correct."
    exit 1
  fi
}

trap finish EXIT
