# Raiden Integration Image

## About

This integration image acts as a base to ran integration tests for the Light Client in a fully controlled, 
contained environment.

The environment contains:
- Geth running a private chain using the Clique PoA engine.
- [Raiden Contracts](https://github.com/raiden-network/raiden-contracts) pre deployed
- Matrix Synapse
- Pathfinding Service ([raiden-services](https://github.com/raiden-network/raiden-services))
- A `CustomToken` deployed with a `Token Network` deployed
- Two [Raiden](https://github.com/raiden-network/raiden) nodes with a pre funded open channel

## Using the image

### Building

To build the docker image you need to run:

```bash
docker build -t lightclient-integration .
```  
  
### Running

To start the container you can run:

```bash
docker run --name lc-integration -d \
  -p 127.0.0.1:80:80 \
  -p 127.0.0.1:6000:6000 \
  -p 127.0.0.1:5001:5001 \
  -p 127.0.0.1:5002:5002 \
  -p 127.0.0.1:8545:8545 lightclient-integration
```

### Services

After starting the container you can access the following services:

- RPC is running at `8545`
- Synapse is running at port `80`
- PFS is running at port `6000`
- Raiden node 1 is running at `5001`
- Raiden node 2 is running at `5002`

### Running the tests

It is suggested to run the tests using the `run-integration.sh`. The script starts a temporary container,
runs the tests and then stops and deletes the container. This makes sure that tests are always run in 
a clean environment.

#### Getting service logs
To access the logs of all the underlying services you can run `run-integration.sh DEBUG`. This
will copy the logs from the integration container to the `logs` folder.

## Updating the image
Unless there are some major changes in some of the dependencies or the different part updating the environment should
be as simple as updating the following arguments in the `Dockerfile`.

```dockerfile
ARG CONTRACTS_VERSION="0.36.2"
ARG SERVICES_VERSION="100fecf0d8c21ee68d8afbea912b67167ec7aad3"
ARG RAIDEN_VERSION="ea7025739b460f940c26616ca1fccdb739b218ed"
ARG SYNAPSE_VERSION=1.10.0
```

### Raiden
Starting with Raiden, you need to visit the Raiden [repository](https://github.com/raiden-network/raiden/) and
locate the version of Raiden you want to use for the integration tests. This can be a tagged version or a specific commit.

You need to locate the the git commit hash and update the `RAIDEN_VERSION` argument:

```dockerfile
ARG RAIDEN_VERSION="ea7025739b460f940c26616ca1fccdb739b218ed"
```

### Contracts
Raiden will have a pinned version of `raiden-contracts`. You can locate the version of the contracts by looking into the
[requirements.txt](https://github.com/raiden-network/raiden/blob/ea7025739b460f940c26616ca1fccdb739b218ed/requirements/requirements.txt#L75)
for the commit you are interested. The requirements entry will look like this:
 
```requirements.txt
raiden-contracts==v0.37.0-beta  # via -r requirements.in
```

You have to update the `CONTRACTS_VERSION` argument with the contract's version required by Raiden:  

```dockerfile
ARG CONTRACTS_VERSION="0.37.0-beta"
```

### Services
The next step would be updating the service. To locate a compatible version of Raiden Services you can go to the [requirements.txt](https://github.com/raiden-network/raiden-services/blob/100fecf0d8c21ee68d8afbea912b67167ec7aad3/requirements.txt#L2)
file and locate the a version or commit that is compatible.

You can find a release or a commit that is compatible with the contract version located above using GitHub's [blame](https://github.com/raiden-network/raiden-services/blame/100fecf0d8c21ee68d8afbea912b67167ec7aad3/requirements.txt#L2) interface.
As soon as you locate the commit you are interested you need to update the `SERVICES_VERSION` argument.

```dockerfile
ARG SERVICES_VERSION="100fecf0d8c21ee68d8afbea912b67167ec7aad3"
```

### Transport
The transport configuration is based on the [Raiden Service Bundle](https://github.com/raiden-network/raiden-service-bundle/) `RSB`.

The configuration has been slightly modified over the original RSB configuration to fit the purposes of the integration image. 
When merging changes from upstream please evaluate if these changes are required or not. 

- `setup/room_ensurer.py` is based on [room_ensurer.py](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/room_ensurer/room_ensurer.py)
- `synapse/auth/admin_user_auth_provider.py` is based on [admin_user_auth_provider.py](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/synapse/admin_user_auth_provider.py)
- `synapse/auth/eth_auth_provider.py` is based on [eth_auth_provider.py](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/synapse/eth_auth_provider.py)
- `synapse/exec/synapse-entrypoint.sh` is based on [synapse-entrypoint.sh](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/synapse/synapse-entrypoint.sh)
- `synapse/exec/render_config_template.py` is based on [render_config_template.py](https://github.com/raiden-network/raiden-service-bundle/blob/master/build/synapse/render_config_template.py)
- `synapse/synapse.template.yaml` is based on [synapse.template.yaml](https://github.com/raiden-network/raiden-service-bundle/blob/master/config/synapse/synapse.template.yaml)

You can find the Synapse version used in the RSB [here](https://github.com/raiden-network/raiden-service-bundle/blob/e368e925003cac8d09c1d9007cf80c90f6ad73c3/BUILD_VERSIONS#L2).
To update the synapse version used in the integration you need to locate the following argument in the `Dockerfile`: 

```dockerfile
ARG SYNAPSE_VERSION=1.10.0
```

Then you need to change the value accordingly.
