# Connecting
The SDK provides out of the box support for the deployed networks on `Görli`, `Ropsten`, and `Rinkeby`.

If you need to use the SDK on a private network, or a custom deployment you can find more information in the following [guide](../private-chain/README.md).

## Raiden Light Client test environment
For development purposes, the Light Client uses a standalone environment. The dApp deployment [lightclient.raiden.network](https://lightclient.raiden.network/) and the development version served by 'npm run serve' also conforms to this configuration. 

This environment uses:

- A specific version of [Raiden](https://github.com/raiden-network/raiden/releases/tag/v0.200.0-rc3)
- A matrix transport server - `https://raidentransport.test001.env.raiden.network`
- A PFS server - `https://pfs.raidentransport.test001.env.raiden.network`
 
You can find the raiden version tagged on Docker Hub under `raidennetwork/raiden:testenv001`. To pull the image you need to run the following: 

```bash
docker pull raidennetwork/raiden:testenv001
```

The transport server does not participate in the matrix federation. For this reason, you have to explicitly specify it when starting raiden. You can use the following flag:

```bash
--matrix-server=https://raidentransport.test001.env.raiden.network
``` 

Similarly, you also have to specify the path-finding server:

 ```bash
--pathfinding-service-address https://pfs.raidentransport.test001.env.raiden.network
```

## Running a Raiden node in the test environment
You can easily run a python node in the test environment by using Docker. To get the supported Raiden version from [Docker Hub](https://hub.docker.com/r/raidennetwork/raiden) you need to run the following command:

```bash
docker pull raidennetwork/raiden:testenv001
```

The test environment uses the **Görli** testnet. For the purposes of this guide, we assume that a [geth](https://geth.ethereum.org/docs/) node runs locally on your computer. If you use a different ethereum client or RPC provider, please adjust accordingly.  

```bash
geth --goerli console --cache=512 --port 30303 --rpc --rpcapi eth,net,web3,txpool --rpccorsdomain "*" --rpcaddr "0.0.0.0"
```

### Using docker run
You can start the container, by using the following command:

```bash
docker run --rm -it \
    --network=host \
    --mount src=/path/to/keystore,target=/keystore,type=bind \
    raidennetwork/raiden:testenv001 \
    --keystore-path /keystore \
    --network-id 5 \
    --environment-type development \
    --eth-rpc-endpoint http://127.0.0.1:8545 \
    --accept-disclaimer \
    --matrix-server=https://raidentransport.test001.env.raiden.network \
    --pathfinding-service-address https://pfs.raidentransport.test001.env.raiden.network \
    --api-address "http://0.0.0.0:5001"
```

We use `--network=host` if the ethereum node runs locally on the host machine, to provide access to it from the container.  

### Running the python client from source
If you want to use raiden from source code you can start by cloning the raiden repository, and checkout the suggested commit:

```bash
git clone https://github.com/raiden-network/raiden
cd raiden
git checkout 2e741dfdf4bfa564dec760abd5e3d8b2c9d30715
```

Then you need to create a virtual environment using python 3.7 and activate it:

```bash
python3.7 -m venv .venv
source .venv/bin/activate
```

Before starting Raiden, you need to install its dependencies. You can install them by running:

```
make install-dev
```

After the installation, you can start Raiden by running:

```bash
raiden --keystore-path ~/.keystore \
    --log-config raiden:INFO \
    --api-address "http://0.0.0.0:5001" \
    --eth-rpc-endpoint http://localhost:8545 \
    --accept-disclaimer \
    --network-id 5 \
    --environment-type development \
    --routing-mode=pfs \
    --matrix-server=https://raidentransport.test001.env.raiden.network \
    --pathfinding-service-address https://pfs.raidentransport.test001.env.raiden.network 

```

After you get your node running, you will be able to receive token transfers from the Light Client dApp and SDK.


