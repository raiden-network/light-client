ARG DATA_DIR="/opt/chain"
ARG LOCAL_BASE="/opt/geth"
ARG CONTRACTS_VERSION="0.36.0"
ARG PFS_VERSION="918ee6ef2dcfe293d1ce57c11f5ca23c8e9d68f3"
ARG OS_NAME="LINUX"
ARG GETH_VERSION="1.9.9"
ARG GETH_URL_LINUX="https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.9.9-01744997.tar.gz"
ARG GETH_MD5_LINUX="de1b31439dc6697fcbe2d729d2080d22"
ARG RAIDEN_VERSION="2e741dfdf4bfa564dec760abd5e3d8b2c9d30715"

FROM python:3.7 as raiden-builder
# clone raiden repo + install dependencies
RUN git clone -b develop $RAIDEN_VERSION https://github.com/raiden-network/raiden /app/raiden

RUN python3 -m venv /opt/raiden

ENV PATH="/opt/raiden/bin:$PATH"

WORKDIR /app/raiden

RUN make install

FROM python:3.7 as synapse-builder
ARG SYNAPSE_VERSION=1.5.1

RUN \
    python -m venv /synapse-venv && \
    /synapse-venv/bin/pip install "matrix-synapse[sqlite]==${SYNAPSE_VERSION}"

RUN /synapse-venv/bin/pip install psycopg2 coincurve pycryptodome

COPY synapse/eth_auth_provider.py /synapse-venv/lib/python3.7/site-packages/
COPY synapse/admin_user_auth_provider.py /synapse-venv/lib/python3.7/site-packages/

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

RUN apt-get update && apt-get install -y --no-install-recommends python3-virtualenv python3-dev

RUN mkdir -p ${SETUP_FOLDER}

ENV PATH="${SETUP_FOLDER}:$PATH"
COPY geth/download_geth.sh ${SETUP_FOLDER}
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

RUN echo ${KEYSTORE_PASS} > ${PASSWORD_FILE}
COPY geth/genesis.py /usr/local/bin
COPY geth/keystores /opt/geth/
COPY geth/deploy_contracts.py ${SETUP_FOLDER}
COPY geth/deploy.sh ${SETUP_FOLDER}
RUN mkdir -p ${DATA_DIR}
ENV KEYSTORE_PATH="${LOCAL_BASE}/UTC--2020-02-21T12-38-21.170002355Z--cbc49ec22c93db69c78348c90cd03a323267db86"
RUN deploy.sh

FROM python:3.7
LABEL maintainer="Raiden Network Team <contact@raiden.network>"
ARG DATA_DIR
ARG LOCAL_BASE
ARG CONTRACTS_VERSION
ARG OS_NAME
ARG GETH_VERSION

# Prepare supervisor
RUN apt-get update && apt-get install -y supervisor --no-install-recommends python3-virtualenv python3-dev
RUN mkdir -p /var/log/supervisor

COPY services/pfs-entrypoint.sh /usr/local/bin/

# Private chain setup
COPY --from=builder "${LOCAL_BASE}/bin/" /usr/local/bin/
RUN ln -sfn /usr/local/bin/geth-${OS_NAME}-${GETH_VERSION} /usr/local/bin/geth

RUN mkdir -p /opt/chain
COPY --from=builder "${DATA_DIR}" /opt/chain

RUN mkdir -p /opt/deployment
COPY --from=builder "/opt/raiden-contracts/user_deposit_info.sh" /opt/deployment
COPY --from=builder "/opt/raiden-contracts/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_private_net.json" /opt/deployment/
COPY --from=builder "/opt/raiden-contracts/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_services_private_net.json" /opt/deployment/

# Geth ports
EXPOSE 8545 8546 8547 30303 30303/udp
ENV SERVER_NAME=localhost

RUN mkdir -p /opt/synapse/config
RUN mkdir -p /opt/synapse/data_well_known
COPY synapse/synapse.template.yaml /opt/synapse/config/
COPY synapse/synapse-entrypoint.sh /usr/local/bin/
COPY synapse/render_config_template.py /usr/local/bin/

RUN mkdir -p /opt/synapse/venv/
COPY --from=synapse-builder /synapse-venv /opt/synapse/venv

# Matrix ports
# HTTP, HTTP metrics, TCP replication, HTTP replication
EXPOSE 80 9101 9092 9093

# Services
ARG PFS_VERSION

WORKDIR /opt/services
RUN git clone https://github.com/raiden-network/raiden-services.git
WORKDIR /opt/services/raiden-services
RUN git checkout "${PFS_VERSION}"

RUN /usr/bin/python3 -m virtualenv -p /usr/bin/python3 /opt/services/venv

RUN /opt/services/venv/bin/pip install -r requirements.txt
RUN /opt/services/venv/bin/pip install -e .

RUN cp /opt/deployment/deployment_private_net.json /opt/services/venv/lib/python3.7/site-packages/raiden_contracts/data/
RUN cp /opt/deployment/deployment_services_private_net.json /opt/services/venv/lib/python3.7/site-packages/raiden_contracts/data/
RUN mkdir -p /opt/services/keystore
COPY services/keystore/UTC--2020-03-11T15-39-16.935381228Z--2b5e1928c25c5a326dbb61fc9713876dd2904e34 /opt/services/keystore

EXPOSE 6000

# prepare raiden
COPY --from=raiden-builder /opt/raiden /opt/raiden

RUN mkdir -p /opt/raiden/config/keys
COPY geth/keystores/* /opt/raiden/config/keys/
COPY raiden/* /opt/raiden/config/

RUN cp /opt/deployment/deployment_private_net.json /opt/raiden/lib/python3.7/site-packages/raiden_contracts/data
RUN cp /opt/deployment/deployment_services_private_net.json /opt/raiden/lib/python3.7/site-packages/raiden_contracts/data

COPY room_ensurer/room_ensurer.py /usr/local/bin
COPY setup_channels.sh /usr/local/bin
COPY prepare_channel.py /usr/local/bin

RUN chmod u+x /usr/local/bin/setup_channels.sh
RUN chmod u+x /usr/local/bin/room_ensurer.py
RUN chmod u+x /usr/local/bin/prepare_channel.py
RUN setup_channels.sh

EXPOSE 5001 5002

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
CMD ["/usr/bin/supervisord"]
