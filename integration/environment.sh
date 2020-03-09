#!/usr/bin/env bash

export GETH_URL_LINUX="https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.9.9-01744997.tar.gz"
export GETH_MD5_LINUX="de1b31439dc6697fcbe2d729d2080d22"
export GETH_VERSION="1.9.9"
export OS_NAME="LINUX"
export LOCAL_BASE="${PWD}/.local"
export PATH="${PWD}/.local/bin:$PATH"
export KEYSTORE_PATH="${PWD}/geth/keystores/UTC--2020-02-21T12-38-21.170002355Z--cbc49ec22c93db69c78348c90cd03a323267db86"
export KEYSTORE_PASS=1234
