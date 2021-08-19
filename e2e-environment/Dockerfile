ARG RAIDEN_VERSION="v3.0.0rc0"
ARG CONTRACTS_PACKAGE_VERSION="0.39.0"
ARG CONTRACTS_VERSION="0.39.0"
ARG SERVICES_VERSION="v0.16.0"
ARG SYNAPSE_VERSION="v1.35.1"
ARG RAIDEN_SYNAPSE_MODULES="0.1.3"
ARG OS_NAME="LINUX"
ARG GETH_VERSION="1.10.8"
ARG GETH_URL_LINUX="https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.10.8-26675454.tar.gz"
ARG GETH_MD5_LINUX="29dfd7f76e929c101ff96cf6088bb6c7"

FROM python:3.9 as raiden-builder
ARG RAIDEN_VERSION

# clone raiden repo + install dependencies
RUN git clone -b develop https://github.com/raiden-network/raiden /app/raiden
RUN python3 -m venv /opt/raiden
ENV PATH="/opt/raiden/bin:$PATH"

WORKDIR /app/raiden
RUN git checkout ${RAIDEN_VERSION}
RUN make install

FROM python:3.9 as synapse-builder

RUN python -m venv /synapse-venv && /synapse-venv/bin/pip install wheel

ARG SYNAPSE_VERSION
ARG RAIDEN_SYNAPSE_MODULES

RUN /synapse-venv/bin/pip install \
    "matrix-synapse[postgres,redis]==${SYNAPSE_VERSION}" \
    psycopg2 \
    coincurve \
    pycryptodome \
    "twisted>=20.3.0" \
    click==7.1.2 \
    docker-py \
    raiden-synapse-modules==${RAIDEN_SYNAPSE_MODULES}

# XXX Temporary hot-patch while https://github.com/matrix-org/synapse/pull/9820 is not released yet -- note: this should
# be run in  in workerless setup
RUN sed -i 's/\(\s*\)if self.worker_type/\1if True or self.worker_type/' /synapse-venv/lib/python3.9/site-packages/raiden_synapse_modules/pfs_presence_router.py

COPY synapse/auth/ /synapse-venv/lib/python3.9/site-packages/

FROM python:3.9
LABEL maintainer="Raiden Network Team <contact@raiden.network>"

ARG OS_NAME
ARG GETH_URL_LINUX
ARG GETH_MD5_LINUX
ARG CONTRACTS_VERSION
ARG CONTRACTS_PACKAGE_VERSION
ARG GETH_VERSION

RUN apt-get update \
 && apt-get install -y --no-install-recommends supervisor python3-virtualenv libgtk2.0-0 libgtk-3-0 libgbm-dev libnotify-dev libgconf-2-4 libnss3 libxss1 libasound2 libxtst6 xauth xvfb \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

ENV SERVER_NAME="localhost:9080"
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
    && cp -R /opt/deployment/* ${VENV}/lib/python3.9/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/

RUN mkdir -p /opt/synapse/config \
    && mkdir -p /opt/synapse/data_well_known \
    && mkdir -p /opt/synapse/venv/ \
    && mkdir -p /var/log/supervisor

COPY synapse/synapse.template.yaml /opt/synapse/config/
COPY synapse/exec/ /usr/local/bin/
COPY --from=synapse-builder /synapse-venv /opt/synapse/venv

# Services
ARG SERVICES_VERSION

WORKDIR /opt/services
RUN git clone https://github.com/raiden-network/raiden-services.git
WORKDIR /opt/services/raiden-services
RUN git checkout "${SERVICES_VERSION}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-dev \
    # FIXME: why use the system 3.7 here?
    && /usr/bin/python3 -m virtualenv -p /usr/bin/python3 /opt/services/venv \
    && /opt/services/venv/bin/pip install -U pip wheel \
    && /opt/services/venv/bin/pip install -r requirements.txt \
    && /opt/services/venv/bin/pip install -e . \
    && mkdir -p /opt/services/keystore
RUN cp -R ${VENV}/lib/python3.9/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/* /opt/services/venv/lib/python3.9/site-packages/raiden_contracts/data \
    && rm -rf ~/.cache/pip \
    && apt-get -y remove python3-dev \
    && apt-get -y autoremove \
    && apt-get -y clean \
    && rm -rf /var/lib/apt/lists/*

ENV DEPLOYMENT_INFO=/opt/deployment/deployment_private_net.json
ENV DEPLOYMENT_SERVICES_INFO=/opt/deployment/deployment_services_private_net.json

COPY services/keystore/UTC--2020-03-11T15-39-16.935381228Z--2b5e1928c25c5a326dbb61fc9713876dd2904e34 /opt/services/keystore

ENV ETH_RPC="http://localhost:8545"

RUN setup_channels.sh

## GETH
EXPOSE 8545 8546 8547 30303 30303/udp
## PFS
EXPOSE 5555
## RAIDEN
# HTTP
EXPOSE 5001 5002
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

# In order to preserve the entrypoint for CicleCI https://circleci.com/docs/2.0/custom-images/#adding-an-entrypoint
LABEL com.circleci.preserve-entrypoint=true

ENTRYPOINT ["entrypoint.sh"]
