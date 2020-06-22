# Serve Pull Request dApp Service

This folder contains an script and a docker-compose service to serve Pull Request dApp artifacts as prebuilt testing versions through a nginx/openresty service. It's standalone and doesn't require installing any dependencies beyond having docker and docker-compose installed and set up.

## Preparation

All of these steps are performed inside the same folder containing this file, i.e. `serve_pr`.

Create a `.env` file on the same folder as the `docker-compose.yml` file and there put the variable containing the [CircleCI API Token](https://circleci.com/docs/api/#add-an-api-token):

```sh
CIRCLE_TOKEN=<your_token_here>
```

Also, add a new folder, `app`, and be sure it has `rwx` permission for user/group `nobody`, either by having it owned by this group and group permissions, or giving this permission to `others`:

```sh
mkdir -p ./app/
chmod g=rwx ./app
sudo chgrp nobody ./app
```

## Serve from Docker

```sh
docker-compose up
```

You can then navigate on a browser to [https://localhost:8080/?branch=feature/test_pr](https://localhost:8080/?branch=feature/test_pr). This will trigger the service to download the latest build artifacts for given branch and then (if successful) redirect user to `/pull/1754`, which will serve the downloaded build. Refreshing this endpoint won't re-download it, only serve the previous build, but going again to `/?branch=<branch>` will.

Notice `?branch=<branch>` param to root endpoint receives upstream branch only. For PRs opened from forks, this will be `pull/<PR_number>`, but for PRs opened from upstream branches, it'll be the actual branch name (as in the example above).

## Serve from script

You can use the script directly as well, which will download a build artifact and serve it directly on root (through a simple `python -m http.server` server).

```sh
set -a  # allows sourced .env vars to be exported to script
. ./.env  # source .env file
set +a  # disable exporting all
bash -x ./ci_dapp.sh 'branch=feature/test_pr' -s  # -s as 2nd param starts the server at the end of script
```

Then you can go to http://localhost:8080/ to access the served instance.  Finalize with `Ctrl+C` and restart to refresh download.
