# Raiden End-to-End Test Environment

## About

To test the Light Client in a fully controlled and contained environment, the
`raidennetwork/lightclient-e2e-environment` Docker image is used. This
environment contains:

- Geth as Ethereum node running a private chain using the Clique PoA engine
- [Raiden Contracts](https://github.com/raiden-network/raiden-contracts) pre-deployed to the chain
- Synapse as Matrix server
- Path-finding service ([raiden-services](https://github.com/raiden-network/raiden-services))
- A `CustomToken`, `Token Network` contract deployed to the chain
- Two [Raiden](https://github.com/raiden-network/raiden) nodes with a pre-funded open channel

## Get Docker Image

The image is available on DockerHub and can be pulled locally. Note that the
test scripts will pull the image automatically if not available yet. Though this
step will be necessary if the image was already once pulled, but got an update
since then.

```sh
docker pull raidennetwork/lightclient-e2e-environment
```

Alternatively it can be built locally as well. This requires to use the
according script for the maintenance of the deployment information files. These
will be automatically staged to the VCS after the script has run and need to be
committed afterwards.

```sh
bash ./build-e2e-environment.sh
```

## Run Docker Container

Despite this step should be never necessary to be done manually, this is how it
works:

```sh
docker run --detach --rm \
  --name lc-e2e \
  --publish 127.0.0.1:9080:9080 \
  --publish 127.0.0.1:5555:5555 \
  --publish 127.0.0.1:5001:5001 \
  --publish 127.0.0.1:5002:5002 \
  --publish 127.0.0.1:8545:8545 \
  raidennetwork/lightclient-e2e-environment
```

## Access Services

After the Docker container gets started, the services are accessible at the
following ports on `localhost`:

- RPC endpoint of the Geth Etherum node: `8545`
- Synapse Matrix server: `9080`
- Path-finding service: `5555`
- First Raiden node: `5001`
- Second Raiden node: `5002`

## Running Tests

In first place it is suggested to run the tests via the according package script
in the respective workspace. This script is equally named and can be run like
this `yarn workspace raiden-ts test:e2e:docker`.
Under the hood this will make use of the `./run-e2e-tests.sh` script. This will
make sure that the required deployment information are available, eventually
pulls the image if not available (notice that it doesn't update the image) and
takes care about bringing up the test environment, running the tests and cleanly
shutting everything down. The tests themselves will run on `localhost`. The logs
of the services will be provided automatically within the `./logs`
directory.

**Hint:** It might be helpful to run the end-to-end tests of the dApp in
headless mode. Therefore just append the parameter `--headless` to the (package)
script.

## Upgrade Environment in Docker Image

The image build gets controlled by a couple of version argument in the
`Dockerfile`. Unless there are some breaking changes of the dependencies it is
enough to simply update these version arguments.

```dockerfile
ARG RAIDEN_VERSION="v2.0.0"
ARG CONTRACTS_PACKAGE_VERSION="0.39.0"
ARG CONTRACTS_VERSION="0.39.0"
ARG SERVICES_VERSION="v0.16.0"
ARG SYNAPSE_VERSION="1.35.1"
ARG GETH_VERSION="1.10.7"
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

## Upgrade image version for tests and CI

To upgrade the end-to-end environment you need to build and upload a new image.
First update any component as described above.

Then build and test those versions locally. Finally you need to increment
`DOCKER_IMAGE_TAG` in `shared-script.sh` and build the new image version:

```sh
./build-e2e-environment.sh
```

This will also tag the image. You can then upload it to docker hub:

```
docker push raidennetwork/lightclient-e2e-environment:v1.1.4
```

Once this is done, don't forget to update the image version used in CI. In
`.circleci/config.yml` update `e2e_environment_docker_image` to the version you
just created.
