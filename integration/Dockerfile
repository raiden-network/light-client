ARG CONTRACTS_VERSION="0.36.0"
ARG PFS_VERSION="918ee6ef2dcfe293d1ce57c11f5ca23c8e9d68f3"
ARG RAIDEN_VERSION="2e741dfdf4bfa564dec760abd5e3d8b2c9d30715"
ARG OS_NAME="LINUX"
ARG GETH_VERSION="1.9.9"
ARG GETH_URL_LINUX="https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.9.9-01744997.tar.gz"
ARG GETH_MD5_LINUX="de1b31439dc6697fcbe2d729d2080d22"

FROM python:3.7 as raiden-builder
ARG RAIDEN_VERSION

# clone raiden repo + install dependencies
RUN git clone -b develop https://github.com/raiden-network/raiden /app/raiden
RUN python3 -m venv /opt/raiden
ENV PATH="/opt/raiden/bin:$PATH"

WORKDIR /app/raiden
RUN git checkout ${RAIDEN_VERSION}
RUN make install

FROM python:3.7 as synapse-builder
ARG SYNAPSE_VERSION=1.5.1

RUN python -m venv /synapse-venv \
    && /synapse-venv/bin/pip install "matrix-synapse[sqlite]==${SYNAPSE_VERSION}" \
    && /synapse-venv/bin/pip install psycopg2 coincurve pycryptodome

COPY synapse/auth/ /synapse-venv/lib/python3.7/site-packages/

FROM python:3.7
LABEL maintainer="Raiden Network Team <contact@raiden.network>"

ARG OS_NAME
ARG GETH_URL_LINUX
ARG GETH_MD5_LINUX
ARG CONTRACTS_VERSION
ARG GETH_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends supervisor python3-virtualenv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV SERVER_NAME=localhost
ENV PASSWORD_FILE=/opt/passwd
ENV PASSWORD=1234

RUN echo ${PASSWORD} > ${PASSWORD_FILE}

COPY setup/ /usr/local/bin

# prepare raiden
COPY --from=raiden-builder /opt/raiden /opt/raiden
COPY raiden/ /opt/raiden/config/

# Download GETH
ARG DEPLOYMENT_DIRECTORY=/opt/deployment
ARG VENV=/opt/raiden
ARG SMARTCONTRACTS_ENV_FILE=/etc/profile.d/smartcontracts.sh

COPY geth/* /usr/local/bin/

ARG LOCAL_BASE=/usr/local
ARG DATA_DIR=/opt/chain

RUN download_geth.sh && deploy.sh \
    && cp -R /opt/raiden/lib/python3.7/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_private_net.json /opt/deployment/ \
    && cp -R /opt/raiden/lib/python3.7/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_services_private_net.json /opt/deployment/

RUN mkdir -p /opt/synapse/config \
    && mkdir -p /opt/synapse/data_well_known \
    && mkdir -p /opt/synapse/venv/ \
    && mkdir -p /var/log/supervisor

COPY synapse/synapse.template.yaml /opt/synapse/config/
COPY synapse/exec/ /usr/local/bin/
COPY --from=synapse-builder /synapse-venv /opt/synapse/venv

# Services
ARG PFS_VERSION

WORKDIR /opt/services
RUN git clone https://github.com/raiden-network/raiden-services.git
WORKDIR /opt/services/raiden-services
RUN git checkout "${PFS_VERSION}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-dev \
    && /usr/bin/python3 -m virtualenv -p /usr/bin/python3 /opt/services/venv \
    && /opt/services/venv/bin/pip install -r requirements.txt \
    && /opt/services/venv/bin/pip install -e . \
    && mkdir -p /opt/services/keystore \
    && cp -R /opt/raiden/lib/python3.7/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/* /opt/services/venv/lib/python3.7/site-packages/raiden_contracts/data \
    && rm -rf ~/.cache/pip \
    && apt-get -y remove python3-dev \
    && apt-get -y autoremove \
    && apt-get -y clean \
    && rm -rf /var/lib/apt/lists/*

ENV DEPLOYMENT_INFO=/opt/deployment/deployment_private_net.json
ENV DEPLOYMENT_SERVICES_INFO=/opt/deployment/deployment_services_private_net.json

COPY services/keystore/UTC--2020-03-11T15-39-16.935381228Z--2b5e1928c25c5a326dbb61fc9713876dd2904e34 /opt/services/keystore

RUN setup_channels.sh
#                                                           HTTP, HTTP metrics, TCP replication, HTTP replication
# GETH                               | RAIDEN  |SUP |PFS | Matrix
EXPOSE 8545 8546 8547 30303 30303/udp 5001 5002 9001 6000 80 9101 9092 9093

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# In order to preserve the entrypoint for CicleCI https://circleci.com/docs/2.0/custom-images/#adding-an-entrypoint
LABEL com.circleci.preserve-entrypoint=true

ENTRYPOINT ["entrypoint.sh"]
