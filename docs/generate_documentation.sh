#!/usr/bin/env bash

cd ../raiden-ts

if [[ -d './docs' ]]
then
    rm -rf docs
fi

pnpm run docs:generate

[[ -d 'docs/.vuepress' ]] || mkdir docs/.vuepress
[[ -d 'docs/.vuepress/styles' ]] || mkdir docs/.vuepress/styles

cp ../docs/config.js docs/.vuepress/config.js
cp ../docs/palette.styl docs/.vuepress/styles/palette.styl
cp -R ../docs/sdk-docs/. docs/

pnpm run docs:build

if [[ ! -d '../raiden-dapp/dist/' ]]
then
    echo 'The dApp dist directory was not available'
    exit 1;
fi

[[ ! -d '../raiden-dapp/dist/docs' ]] || rm -rf ../raiden-dapp/dist/docs

cp -r docs/.vuepress/dist ../raiden-dapp/dist/docs
