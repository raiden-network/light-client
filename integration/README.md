# Integration Image

Building:
```bash
docker build -t lightclient-integration .
```
  
  
Running:
```bash
docker run -p 80:80 -p 6000:6000 -p 5001:5001 -p 5002:5002 -p 8545:8545 -v lightclient-integration
```

- Private chain RPC is running at `8545`
- Synapse is running at port `80`
- PFS is running at port `6000`
- First Raiden node is running at `5001`
- Second Raiden node is running at `5002`

To run the tests locally you first need to start the docker image.

Then you need to pull the `deployment_private_net.json` and `deployment_services_private_net.json` from the container.
You can easily do that by sourcing `source pull_deployment.sh container_name`. This will download the files to `/tmp/deployment`
and export `DEPLOYMENT_INFO` and `DEPLOYMENT_SERVICES_INFO` that are used by the integration tests to connect to the private chain.

