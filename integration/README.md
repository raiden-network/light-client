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
docker run --name lc-integration -p 80:80 -p 6000:6000 -p 5001:5001 -p 5002:5002 -p 8545:8545 lightclient-integration
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
