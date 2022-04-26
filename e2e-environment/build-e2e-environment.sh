#!/usr/bin/env bash
# shellcheck disable=SC1090
#
# Parameters:
#   --force   Overwrite already existing image locally with same version tag.

SHARED_SCRIPT_PATH="$(dirname "${BASH_SOURCE[0]}")/shared-script.sh"
source "$SHARED_SCRIPT_PATH"

if docker_image_exists_locally && [[ $1 != "--force" ]]; then
  echo "There is already an image locally for this repository and tag version!"
  echo "If you want to build a new version of the image, please adopt the version tag first."
  echo "If you want to overwrite the existing image, provide the '--force' flag to the script."
  exit 1
fi

echo -e "\nBuild the Docker image for the end-to-end environment"
docker build --progress=plain --tag "$DOCKER_IMAGE_NAME" "$E2E_ENVIRONMENT_DIRECTORY"

extract_deployment_information

git add "$DEPLOYMENT_INFORMATION_DIRECTORY"
echo -e "\nPlease commit the new deployment information (already staged)"
