#!/usr/bin/env bash

if [[ "$#" -ne 1 ]]; then
    VERSION_PARAMS=`pnpm version --help | grep -oPm1 'npm version (.*)' | sed 's/npm version/''/g'`
    echo "USAGE: $0 $VERSION_PARAMS"
    exit 1
fi

cd raiden-ts

PACKAGE_VERSION=$(cat package.json \
  | grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g' \
  | tr -d '[[:space:]]')

# Using `--no-git-tag-version` in January 2020 serves no purpose due to `npm version`
# expecting the command to run from the same directory that also hosts the `.git` folder
# You can find more information on https://github.com/npm/npm/issues/9111.
# We disable the whole functionality because there no option exists to disable only automatic tagging.
VERSION=$(pnpm version $1 --no-git-tag-version )
echo "sdk version update updated to $VERSION"
MESSAGE="$PACKAGE_VERSION -> $VERSION";

cd ../raiden-dapp/

DAPP_VERSION=$(pnpm version $1 --no-git-tag-version)
echo "dApp version update updated to $DAPP_VERSION"

cd ../
ROOT_VERSION=$(pnpm version $1 --no-git-tag-version)
echo "dApp version update updated to $ROOT_VERSION"

pnpm install

git add package.json
git add raiden-ts/package.json
git add raiden-dapp/package.json
git add pnpm-lock.yaml

echo "Preparing to commit version update $MESSAGE"
git commit -m "$MESSAGE"
