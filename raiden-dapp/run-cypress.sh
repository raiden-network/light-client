#!/usr/bin/bash

# NOTE: Usage of short parameter names against convention to support MacOS.

BASE_PATH="$(realpath "$(dirname "${BASH_SOURCE[0]}")")"
BUILD_FOLDER="${BASE_PATH}/dist"
SERVE_PID=-1

function finish() {
  if [[ $SERVE_PID != -1 ]]; then
    kill $SERVE_PID
  fi
}

function ensure_cypress_is_available() {
  npx cypress install
}

# This includes an time saving improvement to re-use the already existing dApp
# build if running within the CI environment. The dApp got alreay build here in
# every workflow, so it must be available. For local development it makes sense
# to re-build the dApp for to fixes.
function build_dapp_if_necessary() {
  if [[ "$(whoami)" != "circleci" ]]; then
    yarn build --mode e2e
  fi
}

# The serve process will run in the background and gets killed when the script
# ends (in fact when Cypress finished running the tests).
# After a sensible timeout it will delete all asset files that get served. This
# makes them unavailable for any client. This is used to verify that the dApp
# works fully offline once it cached all assets. Though the serve process must
# remain active as Cypress will fail else. This is related to to a code coverage
# collection feature that can't be disabled.
function serve_dapp_and_delete_assets_after_a_while() {
  local temporary_serve_folder="$(mktemp -d)"
  cp -r $BUILD_FOLDER/* "$temporary_serve_folder/"
  cp $DEPLOYMENT_INFO "$temporary_serve_folder/"
  cp $DEPLOYMENT_SERVICES_INFO "$temporary_serve_folder/"
  npx serve "$temporary_serve_folder" -p 5000 &
  SERVE_PID=$!
  (sleep 180s; rm -rf "$temporary_serve_folder") &
}

set -e
trap finish EXIT
build_dapp_if_necessary
ensure_cypress_is_available
serve_dapp_and_delete_assets_after_a_while
npx nyc cypress ${1-run --headless}
