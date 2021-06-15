#!/usr/bin/env bash

set -e

if [[ "$#" -ne 1 ]]; then
  echo "Usage: $0 [--major|--minor|--patch]"
  exit 1
fi

cd "$(dirname $0)"

OLD_VERSION=$(yarn versions --json | jq -er '.data."light-client"')
yarn version "--${1}" --no-git-tag-version
NEW_VERSION=$(yarn versions --json | jq -er '.data."light-client"')
MESSAGE="$OLD_VERSION -> $NEW_VERSION"

yarn workspace raiden-ts version --no-git-tag-version --new-version "${NEW_VERSION}"
yarn workspace raiden-dapp version --no-git-tag-version --new-version "${NEW_VERSION}"
yarn workspace @raiden_network/raiden-cli version --no-git-tag-version --new-version "${NEW_VERSION}"

yarn install

git add package.json raiden-{ts,dapp,cli}/package.json yarn.lock

echo "Preparing to commit version update $MESSAGE"
git commit -m "$MESSAGE"
