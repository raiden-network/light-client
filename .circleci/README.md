# CircleCI docker images

The image is based on the circleci/node:12-browsers docker image, but also contains pnpm.

## Updating the images
If you need to update the image, e.g. you need to use a new version of the base image with a newer version of node, you have to follow the instructions bellow.

Only members of the light-client team on dockerhub can push changes to the image.

### Build the new image
To build a new image you have to run the following command in this directory:

```bash
docker build -t lightclient-node-pnpm .
```

### Tag the new image
After the image builds successfully you can tag the new image:

```bash
docker tag lightclient-node-pnpm raidennetwork/lightclient-node-pnpm:latest   
```

### Publish the new image on dockerhub
To publish the new image on dockerhub you have to run the following command:
```bash
docker push raidennetwork/lightclient-node-pnpm:latest   
```
