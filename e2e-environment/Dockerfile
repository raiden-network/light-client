ARG RAIDEN_VERSION="arbitrum"
ARG CONTRACTS_PACKAGE_VERSION="v1.0.0rc4"
ARG CONTRACTS_VERSION="1.0.0"
ARG SERVICES_VERSION="v2.0.0rc1"
ARG SYNAPSE_VERSION="v1.35.1"
ARG RAIDEN_SYNAPSE_MODULES="v1.0.0rc1"
ARG OS_NAME="LINUX"
ARG GETH_VERSION="1.10.13"
ARG GETH_URL_LINUX="https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.10.13-7a0c19f8.tar.gz"
ARG GETH_MD5_LINUX="a1dfdd549ee779654c196d1b01e0ca67"

ARG CONTRACTS_VENV=/opt/contracts/venv
ARG SYNAPSE_VENV=/opt/synapse/venv
ARG SERVICES_VENV=/opt/services/venv


FROM node:16.14.2 as raiden-builder

WORKDIR /app/raiden

ARG RAIDEN_VERSION

RUN git clone --recurse-submodules https://github.com/raiden-network/light-client.git .
RUN git checkout ${RAIDEN_VERSION}
RUN git submodule update
RUN yarn install --frozen-lockfile
RUN yarn workspace raiden-ts build
RUN yarn workspace @raiden_network/raiden-cli build:bundle

FROM python:3.9 as contract-builder

WORKDIR /app/contracts

ARG CONTRACTS_VENV
ARG CONTRACTS_PACKAGE_VERSION

RUN python -m venv ${CONTRACTS_VENV}
RUN ${CONTRACTS_VENV}/bin/pip install --upgrade pip wheel
RUN ${CONTRACTS_VENV}/bin/pip install git+https://github.com/raiden-network/raiden-contracts@${CONTRACTS_PACKAGE_VERSION}


FROM python:3.9 as synapse-builder

ARG SYNAPSE_VENV
ARG SYNAPSE_VERSION
ARG RAIDEN_SYNAPSE_MODULES

RUN python -m venv ${SYNAPSE_VENV}
RUN ${SYNAPSE_VENV}/bin/pip install --upgrade pip wheel
RUN ${SYNAPSE_VENV}/bin/pip install \
  "matrix-synapse[postgres,redis]==${SYNAPSE_VERSION}" \
  psycopg2 \
  coincurve \
  pycryptodome \
  "twisted>=20.3.0" \
  click==7.1.2 \
  docker-py
RUN ${SYNAPSE_VENV}/bin/pip install git+https://github.com/raiden-network/raiden-synapse-modules@${RAIDEN_SYNAPSE_MODULES}

COPY synapse/auth/ ${SYNAPSE_VENV}/lib/python3.9/site-packages/

FROM python:3.9
LABEL maintainer="Raiden Network Team <contact@raiden.network>"

ARG OS_NAME
ARG GETH_URL_LINUX
ARG GETH_MD5_LINUX
ARG CONTRACTS_VERSION
ARG CONTRACTS_PACKAGE_VERSION
ARG GETH_VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl supervisor python3-virtualenv libgtk2.0-0 libgtk-3-0 libgbm-dev libnotify-dev libgconf-2-4 libnss3 libxss1 libasound2 libxtst6 xauth xvfb \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

ENV SERVER_NAME="localhost:9080"
ENV PASSWORD_FILE=/opt/passwd
ENV PASSWORD=1234

RUN echo ${PASSWORD} > ${PASSWORD_FILE}

# Download GETH
ARG DEPLOYMENT_DIRECTORY=/opt/deployment
ARG SMARTCONTRACTS_ENV_FILE=/etc/profile.d/smartcontracts.sh


ARG LOCAL_BASE=/usr/local
ARG DATA_DIR=/opt/chain

# prepare contracts
ARG CONTRACTS_VENV
COPY --from=contract-builder ${CONTRACTS_VENV} ${CONTRACTS_VENV}

COPY geth/download_geth.sh /usr/local/bin/
RUN download_geth.sh

COPY geth/deploy.sh geth/deploy_contracts.py geth/genesis.py /usr/local/bin/
RUN deploy.sh
RUN cp -R ${DEPLOYMENT_DIRECTORY}/* ${CONTRACTS_VENV}/lib/python3.9/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/

RUN mkdir -p /opt/synapse/config \
  && mkdir -p /opt/synapse/data_well_known \
  && mkdir -p /var/log/supervisor

ARG SYNAPSE_VENV
COPY synapse/synapse.template.yaml /opt/synapse/config/
COPY synapse/exec/ /usr/local/bin/
COPY --from=synapse-builder ${SYNAPSE_VENV} ${SYNAPSE_VENV}

# Services
ARG SERVICES_VERSION
ARG SERVICES_VENV

WORKDIR /opt/services
RUN git clone https://github.com/raiden-network/raiden-services.git
WORKDIR /opt/services/raiden-services
RUN git checkout "${SERVICES_VERSION}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3-dev \
  # FIXME: why use the system 3.7 here?
  && /usr/bin/python3 -m virtualenv -p /usr/bin/python3 ${SERVICES_VENV} \
  && ${SERVICES_VENV}/bin/pip install -U pip wheel \
  && ${SERVICES_VENV}/bin/pip install -r requirements.txt \
  && ${SERVICES_VENV}/bin/pip install -e . \
  && mkdir -p /opt/services/keystore
RUN cp -R ${CONTRACTS_VENV}/lib/python3.9/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/* ${SERVICES_VENV}/lib/python3.9/site-packages/raiden_contracts/data \
  && rm -rf ~/.cache/pip \
  && apt-get -y remove python3-dev \
  && apt-get -y autoremove \
  && apt-get -y clean \
  && rm -rf /var/lib/apt/lists/*

ENV DEPLOYMENT_INFO=/opt/deployment/deployment_private_net.json
ENV DEPLOYMENT_SERVICES_INFO=/opt/deployment/deployment_services_private_net.json

COPY services/keystore/UTC--2020-03-11T15-39-16.935381228Z--2b5e1928c25c5a326dbb61fc9713876dd2904e34 /opt/services/keystore

ENV ETH_RPC="http://localhost:8545"

# prepare raiden
RUN curl https://deb.nodesource.com/setup_16.x | bash - && apt install nodejs
COPY --from=raiden-builder /app/raiden/raiden-cli/ /opt/raiden
COPY raiden/ /opt/raiden/config/

COPY setup/setup_channels.sh setup/prepare_channel.py setup/pfs-entrypoint.sh /usr/local/bin/
RUN setup_channels.sh

## GETH
EXPOSE 8545 8546 8547 30303 30303/udp
## PFS
EXPOSE 5555
## RAIDEN
# HTTP
EXPOSE 8080
## MATRIX
# HTTP
EXPOSE 9080
# HTTP metrics
EXPOSE 9101
# TCP replication
EXPOSE 9092
# HTTP replication
EXPOSE 9093

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY setup/entrypoint.sh /usr/local/bin

# In order to preserve the entrypoint for CicleCI https://circleci.com/docs/2.0/custom-images/#adding-an-entrypoint
LABEL com.circleci.preserve-entrypoint=true

ENTRYPOINT ["entrypoint.sh"]
