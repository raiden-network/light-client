ARG DATA_DIR="/opt/chain"
ARG LOCAL_BASE="/opt/geth"
ARG CONTRACTS_VERSION="0.36.0"
ARG OS_NAME="LINUX"
ARG GETH_VERSION="1.9.9"
ARG GETH_URL_LINUX="https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.9.9-01744997.tar.gz"
ARG GETH_MD5_LINUX="de1b31439dc6697fcbe2d729d2080d22"

FROM python:3.7 as builder

ARG DATA_DIR
ARG LOCAL_BASE
ARG CONTRACTS_VERSION
ARG OS_NAME
ARG GETH_VERSION
ARG GETH_URL_LINUX
ARG GETH_MD5_LINUX

ENV SETUP_FOLDER="/opt/setup"
ENV PASSWORD_FILE="${SETUP_FOLDER}/passwd"
ENV KEYSTORE_PASS=1234
ENV GENESIS_FILE="${SETUP_FOLDER}/genesis.json"

RUN apt-get update && apt-get install -y --no-install-recommends python3-virtualenv python3-dev

RUN mkdir -p ${SETUP_FOLDER}
RUN echo ${KEYSTORE_PASS} > ${PASSWORD_FILE}
RUN mkdir -p ${DATA_DIR}

RUN mkdir -p ${SETUP_FOLDER}
COPY download_geth.sh ${SETUP_FOLDER}
COPY deploy_contracts.py ${SETUP_FOLDER}
COPY deploy.sh ${SETUP_FOLDER}
COPY genesis.json ${SETUP_FOLDER}
ENV PATH="${SETUP_FOLDER}:$PATH"

RUN download_geth.sh
ENV PATH="${LOCAL_BASE}/bin:$PATH"

WORKDIR /opt
RUN git clone https://github.com/raiden-network/raiden-contracts.git
WORKDIR /opt/raiden-contracts
RUN git checkout "v${CONTRACTS_VERSION}"

ENV VIRTUAL_ENV=/opt/venv
RUN /usr/bin/python3.7 -m virtualenv -p /usr/bin/python3.7 $VIRTUAL_ENV
ENV PATH="${VIRTUAL_ENV}/bin:$PATH"

WORKDIR /opt/raiden-contracts/
RUN pip install -r requirements.txt
RUN pip install -e .

COPY keystores /opt/geth/
ENV KEYSTORE_PATH="${LOCAL_BASE}/UTC--2020-02-21T12-38-21.170002355Z--cbc49ec22c93db69c78348c90cd03a323267db86"
RUN deploy.sh

FROM ubuntu:18.04
LABEL maintainer="Raiden Network Team <contact@raiden.network>"
ARG DATA_DIR
ARG LOCAL_BASE
ARG CONTRACTS_VERSION
ARG OS_NAME
ARG GETH_VERSION

COPY --from=builder "${LOCAL_BASE}/bin/" /usr/local/bin/
RUN ln -sfn /usr/local/bin/geth-${OS_NAME}-${GETH_VERSION} /usr/local/bin/geth

RUN mkdir -p /opt/chain
COPY --from=builder "${DATA_DIR}" /opt/chain

RUN mkdir /root/.ethash
COPY --from=builder /root/.ethash /root/.ethash

RUN mkdir -p /opt/deployment
COPY --from=builder "/opt/raiden-contracts/user_deposit_info.sh" /opt/deployment
COPY --from=builder "/opt/raiden-contracts/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_private_net.json" /opt/deployment/
COPY --from=builder "/opt/raiden-contracts/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_services_private_net.json" /opt/deployment/

EXPOSE 8545 8546 8547 30303 30303/udp
ENTRYPOINT ["/usr/local/bin/geth"]
CMD ["--rpc", "--datadir", "/opt/chain/", "--networkid", "4321", "--rpcapi", "eth,net,web3,txpool", "--minerthreads=1", "--mine"]

HEALTHCHECK \
    --timeout=5s \
    --start-period=60s \
    CMD curl -s --fail -X POST --data '{"jsonrpc":"2.0","method":"net_version","params":[],"id":67}' || exit 1
