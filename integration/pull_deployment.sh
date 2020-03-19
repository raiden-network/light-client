#!/usr/bin/env bash

if [ ! $# -gt 0 ]; then
  echo "pull_deployment.sh CONTAINER_NAME"
else
  CONTAINER_NAME=$1

  mkdir -p /tmp/deployment

  echo "Getting DEPLOYMENT_INFO from docker image ${CONTAINER_NAME}"
  docker cp "${CONTAINER_NAME}":/opt/deployment/deployment_private_net.json /tmp/deployment
  docker cp "${CONTAINER_NAME}":/opt/deployment/deployment_services_private_net.json /tmp/deployment

  export DEPLOYMENT_INFO=/tmp/deployment/deployment_private_net.json
  export DEPLOYMENT_SERVICES_INFO=/tmp/deployment/deployment_services_private_net.json
fi


