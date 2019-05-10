#!/bin/bash

cd ../raiden
rm -rf ./dist
npm install
npm run build
cd ../raiden-wallet
if [[ "$CI" ]]
then
    echo 'Installing SDK dependencies'
    npm install io-ts redux-observable redux redux-logger typechain
fi
npm install
rm -rf ./node_modules/raiden

if [[ "$CI" ]]
then
    echo 'rsync excluding node_modules'
    rsync --stats -aAvX --exclude 'node_modules' ../raiden/* node_modules/raiden
else
    echo 'rsync including node_modules'
    rsync --stats -aAvX ../raiden/* node_modules/raiden
fi

