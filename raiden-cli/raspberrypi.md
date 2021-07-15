# Procedure to run raiden-cli on the Raspberry Pi

This tutorial assumes the following:

1. These steps have to be run on the _Raspberry Pi 4_.
2. _Raspberry Pi_ has to be in the same network as your **PC** with SSH enabled.
3. The _Raspberry Pi_ is installed with the [Raspberry Pi OS Lite](https://www.raspberrypi.org/software/operating-systems/).

The steps to copy files from your **PC** to the **pi** have been explicitly mentioned and have to be run on your **PC**.

```sh
sudo apt update

sudo apt full-upgrade

sudo apt install git
```

Perform a [git install](https://github.com/nvm-sh/nvm#git-install) of the NVM

```sh
git clone https://github.com/nvm-sh/nvm.git .nvm

cd ~/.nvm

git checkout v0.38.0

. ./nvm.sh

nvm install --lts

npm install --global yarn
```

Check the arm system

```sh
uname -m
armv7l
```

Download **Geth** for your `arm` system above.
We require geth only so we could generate new accounts on the **pi**.
Later you would have to fund the account with _Eth_ and _tokens_ from whichever testnet you would be testing the **pi** on.

```sh
wget https://gethstore.blob.core.windows.net/builds/geth-linux-arm7-1.10.4-aa637fd3.tar.gz

tar -xvzf geth-linux-arm7-1.10.4-aa637fd3.tar.gz

sudo cp geth-linux-arm7-1.10.4-aa637fd3/geth /usr/local/bin/

which geth

geth version

geth account new
```

Refer the [raiden-cli](https://github.com/raiden-network/light-client/tree/master/raiden-cli) guide to generate the **bundle** folder on your x86_64 or x64 PC.

Copy the bundle folder to the Raspberry Pi using the following example(needs to run on your **PC**):

```
scp -r /pathto/light-client/raiden-cli/bundle pi@192.168.29.54:/home/pi/bundle
```

Getting the **leveldown** and **wrtc** `.node` native dependencies for `armv7l` architecture

## Leveldown

On the [leveldown](https://github.com/Level/leveldown/releases/tag/v6.0.0) github download the arm prebuilt binaries using

```sh
wget https://github.com/Level/leveldown/releases/download/v6.0.0/v6.0.0-arm.tar.gz
```

from the folder where you to download it.
run

```sh
tar -xvzf v6.0.0-arm.tar.gz
```

Copy the `node.napi.armv7.node` appropriate place inside the bundle folder.

```sh
cp node.napi.armv7.node ~/bundle/prebuilds/linux-x64/
```

In the `index.js` file inside the bundle folder find out `node.napi.glibc.node` and replace it with `node.napi.armv7.node`

## wrtc

Install wrtc dependency

```sh
yarn add wrtc
```

Copy the `wrtc.node` file in the appropriate folder inside the bundle.
This process is a bit different on the **nanopi** and you would have search and download the `wrtc.node` file from the internet.

```sh
cp ~/.config/yarn/global/node_modules/wrtc/build/Release/wrtc.node ~/bundle/build/
```

## Running the raiden-cli on the Raspberry Pi

```sh
node bundle/index.js --help
```
