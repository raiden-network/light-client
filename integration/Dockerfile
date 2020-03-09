FROM python:3.7 as builder

# use --build-arg RAIDENVERSION=v0.0.3 to build a specific (tagged) version
ARG REPO=raiden-network/raiden
ARG RAIDENVERSION=develop

# This is a "hack" to automatically invalidate the cache in case there are new commits
ADD https://api.github.com/repos/${REPO}/commits/${RAIDENVERSION} /dev/null

# clone raiden repo + install dependencies
RUN git clone -b ${RAIDENVERSION} https://github.com/${REPO} /app/raiden
RUN cd /app/raiden && git checkout 2e741dfdf4bfa564dec760abd5e3d8b2c9d30715

RUN python3 -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app/raiden

RUN make install

ENV GETH_URL_LINUX="https://gethstore.blob.core.windows.net/builds/geth-linux-amd64-1.9.9-01744997.tar.gz"
ENV GETH_MD5_LINUX="de1b31439dc6697fcbe2d729d2080d22"
ENV OS_NAME="LINUX"
ENV LOCAL_BASE="/usr/local"


RUN apt-get update && apt-get install

RUN mkdir -p /geth/private-chain
ADD geth/ /geth
RUN ln -s /geth/download_geth.sh /usr/local/bin/download_geth.sh

RUN download_geth.sh



FROM python:3.7-slim as runner

COPY --from=builder /opt/venv /opt/venv


