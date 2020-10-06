# How to upgrade the test environment

## SDK

### Prerequisites

- Version number of the `raiden-contracts` (e.g. `0.37.1`)
- Git tag name related to the chosen version at the `raiden-contracts` [repository](https://github.com/raiden-network/raiden-contracts/) (e.g. `v0.37.1`)

### Raiden Contracts Submodule

```sh
$ cd ./raiden-ts/raiden-contracts
$ git checkout v0.37.1
```

### Version Generation Script

Edit the file `./raiden-ts/scripts/versions.js` and change the following line
according to the chosen version number (not the tag name).

```javascript
const contracts_version = "0.37.1";
```

### Verify Build

```sh
$ pnpm run clean --filter raiden-ts
$ pnpm install
```

## Docker Images

### Prerequisites

- Access to https://hub.docker.com/r/raidennetwork/raiden
- Docker Image ID of the Raiden Python image that `demoenv001` should use, e.g. `373170d05c6c`

Next, tag the image:

```sh
$ docker tag 373170d05c6c raidennetwork/raiden:demoenv001
```

## Matrix & Raiden Services

Every Raiden release comes hand-in-hand with a [Raiden Service
Bundle](https://github.com/raiden-network/raiden-service-bundle) (`RSB`). The
configured setup for the Light Client uses per default the `demo001.env`
environment. The related service URLs are:

- https://transport.demo001.env.raiden.network
- https://pfs.demo001.env.raiden.network

The environments needs to be updated according to the
[documentation](https://github.com/raiden-network/raiden-service-bundle) of the
selected `RSB` release.

## Raiden Hub

Checkout the
[documentation](https://brainbot-hubraidennetwork.readthedocs-hosted.com/en/latest/)
for the `hub.raiden.network` resource. The resource it's
[repository](https://github.com/raiden-network/hub.raiden.network) includes
all relevant configuration files to build a new image.

If the resource has been updated successfully, check if the hub is online and
attempt to open a channel to it. Finally try to do a transfer with the hub.

## End-to-End Tests (Optional)

The Light client uses a Docker image to run nightly end-to-end tests. To
upgrade this image, checkout the according
[documentation](./e2e-environment/README.md).
