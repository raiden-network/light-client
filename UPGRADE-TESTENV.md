# How to upgrade the test environment `testenv001`

## Upgrading the SDK

### Prerequisites

- Commit hash of the [Raiden Contracts](https://github.com/raiden-network/raiden-contracts/) repo
- Version number of the Raiden Contracts

### Upgrade the smart contracts

```sh
$ cd light-client/raiden-ts/raiden-contracts
$ git checkout $COMMIT_HASH
```

### Upgrade smart contract version number

```sh
$ vim light-client/raiden-ts/scripts/versions.js
```

and change

```javascript
const contracts_version = "0.36.2";
```

### Verify

Next, verify that the build still works:

```sh
$ cd light-client/raiden-ts
$ npm run clean
$ npm ci
$ npm run build
```

## Upgrade Docker image tags

### Prerequisites

- Access to https://hub.docker.com/r/raidennetwork/raiden
- Docker Image ID of the Raiden Python image that `testenv001` should use, e.g. `373170d05c6c`

Next, tag the image:

```sh
$ docker tag 373170d05c6c raidennetwork/raiden:testenv001
```

## Upgrade Matrix & PFS `testenv001` server

Every [Raiden](https://github.com/raiden-network/raiden) release comes hand-in-hand with a [Raiden Service Bundle](https://github.com/raiden-network/raiden-service-bundle) release, and upgrades of `testenv001` are usually handled by the RSB team.

In order to upgrade:

- https://raidentransport.test001.env.raiden.network, and
- https://pfs.raidentransport.test001.env.raiden.network

a new Raiden Service Bundle needs to be set up according to the [Readme](https://github.com/raiden-network/raiden-service-bundle).

## Upgrade the Raiden Hub

### Prerequisites

- Access to https://tower.raiden.network

After you have logged into Tower:

1. Click on **Templates**
2. Locate **Deploy hub.raiden.network**
3. Click on the rocket
4. (Optional) Change **Purge Data** to no if you want to keep the data in MongoDB
5. Click on **Next** and start a new deployment

You can click on **Jobs** on the left side to see when the deployment is done.

### Verify

Visit https://hub.raiden.network and check whether:

- Status is **online**
- You can open a channel and transfer to the Hub

## (Optional) Upgrade the Light Client Integration Tests

The Light client uses a Docker image to run nightly integration tests based on the `testenv001` tag.

To update and publish a new test image you can follow the steps in the integration image [readme](https://github.com/raiden-network/light-client/tree/master/integration#updating-the-image).
