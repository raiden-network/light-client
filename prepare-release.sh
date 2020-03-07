#!/usr/bin/env bash

if [[ "$#" -ne 1 ]]; then
    VERSION_PARAMS=`npm version --help | grep -oPm1 'npm version (.*)' | sed 's/npm version/''/g'`
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
VERSION=$(npm --no-git-tag-version version $1)
MESSAGE="$PACKAGE_VERSION -> $VERSION";

echo "Preparing to commit version update $MESSAGE"

git add package.json
git add package-lock.json

cd ../raiden-dapp/

DAPP_VERSION=$(npm --no-git-tag-version version $1)

echo "dApp version update updated to $DAPP_VERSION"

git add package.json
git add package-lock.json

git commit -m "$MESSAGE"
