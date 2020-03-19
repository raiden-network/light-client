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

RUN \
    python -m venv /synapse-venv && \
    /synapse-venv/bin/pip install "matrix-synapse[sqlite]==${SYNAPSE_VERSION}"

RUN /synapse-venv/bin/pip install psycopg2 coincurve pycryptodome

COPY synapse/eth_auth_provider.py /synapse-venv/lib/python3.7/site-packages/
COPY synapse/admin_user_auth_provider.py /synapse-venv/lib/python3.7/site-packages/

FROM python:3.7
LABEL maintainer="Raiden Network Team <contact@raiden.network>"

ARG OS_NAME
ARG GETH_URL_LINUX
ARG GETH_MD5_LINUX
ARG CONTRACTS_VERSION
ARG GETH_VERSION

RUN apt-get update && apt-get install -y supervisor --no-install-recommends python3-virtualenv python3-dev

ENV PASSWORD_FILE=/opt/passwd
ENV PASSWORD=1234
RUN echo ${PASSWORD} > ${PASSWORD_FILE}

# prepare raiden
COPY --from=raiden-builder /opt/raiden /opt/raiden
RUN mkdir -p /opt/raiden/config/keys
COPY geth/keystores/* /opt/raiden/config/keys/
COPY raiden/* /opt/raiden/config/

# Download GETH
ARG DEPLOYMENT_DIRECTORY=/opt/deployment
ARG VENV=/opt/raiden
ARG SMARTCONTRACTS_ENV_FILE=/etc/profile.d/smartcontracts.sh

COPY geth/download_geth.sh /usr/local/bin
COPY geth/genesis.py /usr/local/bin

ARG LOCAL_BASE=/usr/local
RUN download_geth.sh

COPY geth/deploy_contracts.py /usr/local/bin
COPY geth/deploy.sh /usr/local/bin

ARG DATA_DIR=/opt/chain
RUN deploy.sh

# Prepare supervisor
RUN mkdir -p /var/log/supervisor

COPY services/pfs-entrypoint.sh /usr/local/bin/

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

RUN cp -R /opt/raiden/lib/python3.7/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/* /opt/services/venv/lib/python3.7/site-packages/raiden_contracts/data
RUN cp -R /opt/raiden/lib/python3.7/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_private_net.json /opt/deployment/
RUN cp -R /opt/raiden/lib/python3.7/site-packages/raiden_contracts/data_${CONTRACTS_VERSION}/deployment_services_private_net.json /opt/deployment/

ENV DEPLOYMENT_INFO=/opt/deployment/deployment_private_net.json
ENV DEPLOYMENT_SERVICES_INFO=/opt/deployment/deployment_services_private_net.json

RUN mkdir -p /opt/services/keystore
COPY services/keystore/UTC--2020-03-11T15-39-16.935381228Z--2b5e1928c25c5a326dbb61fc9713876dd2904e34 /opt/services/keystore

# PFS listening port
EXPOSE 6000

COPY room_ensurer/room_ensurer.py /usr/local/bin
COPY setup_channels.sh /usr/local/bin
COPY prepare_channel.py /usr/local/bin

RUN setup_channels.sh

# Raiden Nodes
EXPOSE 5001 5002

# SUPERVISOR
EXPOSE 9001

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY entrypoint.sh /usr/local/bin
CMD ["entrypoint.sh"]
