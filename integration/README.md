# Raiden Integration Image

## About

This integration image acts as a base to ran integration tests for the Light
Client in a fully controlled, contained environment.

The environment contains:

- Geth as Ethereum node running a private chain using the Clique PoA engine
- [Raiden Contracts](https://github.com/raiden-network/raiden-contracts) pre-deployed to the chain
- Synapse as Matrix server
- Path-finding service ([raiden-services](https://github.com/raiden-network/raiden-services))
- A `CustomToken`, `Token Network` contract deployed to the chain
- Two [Raiden](https://github.com/raiden-network/raiden) nodes with a pre-funded open channel

## Build

```sh
docker build --tag lightclient-integration .
```

## Run

```sh
docker run --detach \
  --name lc-integration \
  --publish 127.0.0.1:8545:8545 \
  --publish 127.0.0.1:80:80 \
  --publish 127.0.0.1:6000:6000 \
  --publish 127.0.0.1:5001:5001 \
  --publish 127.0.0.1:5002:5002 \
  lightclient-integration
```

## Access

After starting the container as described above, the services are accessible at
the following port on `localhost`:

- RPC endpoint of the Geth Etherum node: `8545`
- Synapse Matrix server: `80`
- Path-finding service: `6000`
- First Raiden node: `5001`
- Second Raiden node: `5002`

## Tests

It is suggested to run the tests using the `./run-integration.sh`. The script
starts a Docker container and runs the tests. At the end it stops and deletes the
container again. This makes sure that tests are always run in a clean environment.

Please be aware that the script expects that the built image got tagged with the
name `lightclient-integration`.

To access the logs of all the underlying services you can run
`run-integration.sh DEBUG`. This will copy the logs from the integration
container to the `./logs` folder.

## Upgrade

The image build gets controlled by a couple of version argument in the
`Dockerfile`. Unless there are some breaking changes of the dependencies it is
enough to simply update these version arguments.

```dockerfile
ARG RAIDEN_VERSION="v1.1.1"
ARG CONTRACTS_PACKAGE_VERSION="v.37.1"
ARG CONTRACTS_VERSION="0.37.0"
ARG SERVICES_VERSION="100fecf0d8c21ee68d8afbea912b67167ec7aad3"
ARG SYNAPSE_VERSION="1.10.0"
ARG GETH_VERSION="1.9.11"
```

**Note:**
Try to stick with version tags you find at `GitHub` when possible. Use commit
hash values only when there is no tag for the exact version you need. After all
are tags basically just references to commit hashes on their own. But their
advantage is that they have a name that is more handy to work with and better to
read or communicate.

### Raiden

You need to visit the `raiden`
[repository](https://github.com/raiden-network/raiden/) and locate the version
of Raiden you want to use for the integration tests. You then need to fix this
version in the `Dockerfile`:

```dockerfile
ARG RAIDEN_VERSION="v1.1.1"
```

### Contracts

Raiden will have a pinned version of the `raiden-contracts` package. You can
locate the version of them by looking into the
[requirements.txt](https://github.com/raiden-network/raiden/blob/develop/requirements/requirements.txt)
file (switch to the tag/commit you have chosen above for `raiden`). The
relevant requirements entry will look like this:

```requirements.txt
raiden-contracts==0.37.1  # via -r requirements.in
```

You then have to update the `Dockerfile` with this version:

```dockerfile
ARG CONTRACTS_PACKAGE_VERSION="0.37.1"
```

Furthermore you have to figure out which contracts version relates to the
selected package. Note that there is a difference between the `raiden-contracts`
Python package and the actual Raiden contracts. They have their own version
number which is always lower or equal the version of the package.

You can figure out the correct version by inspecting the
[constants.py](https://github.com/raiden-network/raiden-contracts/blob/master/raiden_contracts/constants.py)
file of the `raiden-contracts` package (switch to the tag according to the
version you have chosen for the `raiden-contracts` package). Watch-out for the
`CONTRACTS_VERSION` constant variable. Then update the `Dockerfile` with the
related value:

```dockerfile
ARG CONTRACTS_VERSION="0.37.0"
```

### Services

The next step is to update the services. To find a compatible version of
the `raiden-services` you can inspect the according
[requirements.txt](https://github.com/raiden-network/raiden-services/blob/master/requirements.txt)
file and search for a version of this file that is using the same `raiden`
version as we do. Copy the version tag or commit of the `raiden-services` and
put it's value into the `Dockerfile`:

```dockerfile
ARG SERVICES_VERSION="645e106d406b6fc3e11441c8e85c76d3aff300d3"
```

Note that on old versions of the `raiden-services` there was a direct dependency
to the `raiden-contracts` package. This has been replaced with a dependency to
the `raiden` package itself, indirectly referencing to the `raiden-contracts`
this package is using.

### Transport

The transport configuration is based on the [Raiden Service
Bundle](https://github.com/raiden-network/raiden-service-bundle/) (`RSB`).

The configuration has been slightly modified over the original `RSB`
configuration to fit the purposes of the integration image. When merging changes
from upstream please evaluate if these changes are required or not.

- `setup/room_ensurer.py` is based on [room_ensurer.py](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/room_ensurer/room_ensurer.py)
- `synapse/auth/admin_user_auth_provider.py` is based on [admin_user_auth_provider.py](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/synapse/admin_user_auth_provider.py)
- `synapse/auth/eth_auth_provider.py` is based on [eth_auth_provider.py](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/synapse/eth_auth_provider.py)
- `synapse/exec/synapse-entrypoint.sh` is based on [synapse-entrypoint.sh](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/synapse/synapse-entrypoint.sh)
- `synapse/exec/render_config_template.py` is based on [render_config_template.py](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/synapse/render_config_template.py)
- `synapse/synapse.template.yaml` is based on [synapse.template.yaml](https://github.com/raiden-network/raiden-service-bundle/blob/master/config/synapse/synapse.template.yaml)

You can find the Synapse version used in the `RSB` by inspecting the
[BUILD_VERSIONS](https://github.com/raiden-network/raiden-service-bundle/blob/master/BUILD_VERSIONS)
file. Watch-out for the `SYNAPSE_VERSION` constant variable. Then update the
`Dockerfile` with the related value:

```dockerfile
ARG SYNAPSE_VERSION=1.10.1
```
