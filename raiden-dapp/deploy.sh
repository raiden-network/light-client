#!/bin/sh
# ideas used from https://gist.github.com/motemen/8595451

# Based on https://github.com/eldarlabs/ghpages-deploy-script/blob/master/scripts/deploy-ghpages.sh
# Used with their MIT license https://github.com/eldarlabs/ghpages-deploy-script/blob/master/LICENSE

# abort the script if there is a non-zero error
set -e

if [[ ${DEPLOYMENT} == "staging" ]]; then
    echo 'Deploying to staging'
    DEPLOY_BASE=staging
else
    echo 'Deploying main'
    DEPLOY_BASE=''
fi

echo "Preparing to deploy to GitHub Pages for commit ${CIRCLE_SHA1}"

if [[ ! -f ~/.ssh/known_hosts ]];then
    echo 'Setting up known hosts'
    # preparing to add github public key to known hosts
    mkdir -p ~/.ssh

    echo '
    github.com ssh-rsa AAAAB3NzaC1yc2EAAAABIwAAAQEAq2A7hRGmdnm9tUDbO9IDSwBK6TbQa+PXYPCPy6rbTrTtw7PHkccKrpp0yVhp5HdEIcKr6pLlVDBfOLX9QUsyCOV0wzfjIJNlGEYsdlLJizHhbn2mUjvSAHQqZETYP81eFzLQNnPHt4EVVUh7VfDESU84KezmD5QlWpXLmvU31/yMf+Se8xhHTvKSCZIFImWwoG6mbUoWf9nzpIoaSjB+weqqUUmpaaasXVal72J+UX2B+2RPW3RcT0eOzQgqlJL3RKrTJvdsjE3JEAvGq3lGHSZXy28G3skua2SmVi/w4yCE6gbODqnTWlg7+wC604ydGXA8VJiS5ap43JXiUFFAaQ==
    ' >>~/.ssh/known_hosts
fi

# show where we are on the machine
pwd
remote=$(git config remote.origin.url)

# make a directory to put the gp-pages branch
mkdir gh-pages-branch
cd gh-pages-branch

if [[ ! -d ./${DEPLOY_BASE} ]];then
    mkdir -p ./${DEPLOY_BASE}
fi

# now lets setup a new repo so we can update the gh-pages branch
git config --global user.email ${GH_EMAIL} >/dev/null 2>&1
git config --global user.name ${GH_NAME} >/dev/null 2>&1
git init
git remote add --fetch origin "$remote"

# switch into the the gh-pages branch
if git rev-parse --verify origin/gh-pages >/dev/null 2>&1; then
  git checkout gh-pages
  # delete any old site as we are going to replace it
  # Note: this explodes if there aren't any, so moving it here for now
  git rm -rf ./${DEPLOY_BASE}
else
  git checkout --orphan gh-pages
fi

mv ../dist/* ./${DEPLOY_BASE}

if [[ ! -f CNAME ]];then
    echo 'Setting CNAME'
    echo 'lightclient.raiden.network' >>CNAME
fi

# stage any changes and new files
git add -A
# now commit, ignoring branch gh-pages doesn't seem to work, so trying skip

git commit -m "Automated deployment to GitHub Pages: ${CIRCLE_SHA1} [skip ci]" --allow-empty

# and push, but send any output to /dev/null to hide anything sensitive
git push --force --quiet origin gh-pages
# go back to where we started and remove the gh-pages git repo we made and used
# for deployment
cd ..
rm -rf gh-pages-branch

echo "Finished Deployment!"
