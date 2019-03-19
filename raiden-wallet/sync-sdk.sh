#!/bin/bash

cd ../raiden
npm install
npm run build
cd ../raiden-wallet
npm install
rm -rf ./node_modules/raiden
rsync --stats -aAvX ../raiden/* node_modules/raiden
