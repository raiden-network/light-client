#!/usr/bin/env bash

# This script includes shared variables, functions and shell settings for all
# script related to the end-to-end environment. It is meant to be sourced at the
# very beginning of each script.

DOCKER_IMAGE_TAG_NAME="raidennetwork/lightclient-e2e-environment"
DOCKER_CONTAINER_NAME="lc-e2e"
E2E_ENVIRONMENT_DIRECTORY="$(realpath "$(dirname "${BASH_SOURCE[0]}")")"
DEPLOYMENT_INFORMATION_DIRECTORY="${E2E_ENVIRONMENT_DIRECTORY}/deployment_information"

function finish() {
  echo -e "\nShut down the Docker container"
  docker stop "$DOCKER_CONTAINER_NAME" >/dev/null 2>&1 || true
}

function extract_deployment_information() {
  echo -e "\nExtract deployment information from Docker image"

  rm --recursive --force "$DEPLOYMENT_INFORMATION_DIRECTORY"
  mkdir --parents "$DEPLOYMENT_INFORMATION_DIRECTORY"

  docker run --detach --rm --name "$DOCKER_CONTAINER_NAME" "$DOCKER_IMAGE_TAG_NAME" >/dev/null
  sleep 5s

  docker cp "${DOCKER_CONTAINER_NAME}:/opt/deployment/deployment_private_net.json" "${DEPLOYMENT_INFORMATION_DIRECTORY}/"
  docker cp "${DOCKER_CONTAINER_NAME}:/opt/deployment/deployment_services_private_net.json" "${DEPLOYMENT_INFORMATION_DIRECTORY}/"
  docker cp "${DOCKER_CONTAINER_NAME}:/etc/profile.d/smartcontracts.sh" "${DEPLOYMENT_INFORMATION_DIRECTORY}/"
   
  docker stop "$DOCKER_CONTAINER_NAME" >/dev/null
}

function running_inside_circleci() {
  # All our CircleCI executor use Docker. The assumption is that if the Docker
  # socket (at its default location) does not exist we are inside CircleCI.
  test ! -e /var/run/docker.sock
}

set -e
trap finish EXIT
