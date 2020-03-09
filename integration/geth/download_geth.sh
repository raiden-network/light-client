#!/usr/bin/env bash

set -e
set -x

if [[ -z ${LOCAL_BASE} ]]; then
    LOCAL_BASE=~/.local
fi

GETH_PATH="${LOCAL_BASE}/bin/geth-${OS_NAME}-${GETH_VERSION}"
if [[ ! -x ${GETH_PATH} ]]; then
  mkdir -p ${LOCAL_BASE}/bin
  TEMP=$(mktemp -d 2>/dev/null || mktemp -d -t 'gethtmp')
  pushd ${TEMP}
  GETH_URL_VAR="GETH_URL_${OS_NAME}"
  curl -o geth.tar.gz ${!GETH_URL_VAR}
  tar xzf geth.tar.gz
  cd geth*/
  install -m 755 geth ${GETH_PATH}

  GETH_MD5_VAR="GETH_MD5_${OS_NAME}"
  if [[ ! -n ${!GETH_MD5_VAR} ]]; then
      COMPUTED_MD5=$(md5sum ${GETH_PATH} | cut '-d ' -f1)

      if [[ ${COMPUTED_MD5} != ${!GETH_MD5_VAR} ]]; then
          exit 1;
      fi
  fi
fi
ln -sfn ${GETH_PATH} ${LOCAL_BASE}/bin/geth
