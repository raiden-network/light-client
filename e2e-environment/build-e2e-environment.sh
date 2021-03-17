#!/usr/bin/env bash
# shellcheck disable=SC1090

SHARED_SCRIPT_PATH="$(dirname "${BASH_SOURCE[0]}")/shared-script.sh"
source "$SHARED_SCRIPT_PATH"

echo -e "\nBuild the Docker image for the end-to-end environment"
docker build --tag "$DOCKER_IMAGE_NAME" "$E2E_ENVIRONMENT_DIRECTORY"

extract_deployment_information

git add "$DEPLOYMENT_INFORMATION_DIRECTORY"
echo -e "\nPlease commit the new deployment information (already staged)"
