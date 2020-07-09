# Releasing new versions of raiden-ts

## Table of Contents
- [Table of Contents](#table-of-contents)
- [Preface](#preface)
- [Preparing a new release](#preparing-a-new-release)
    * [Increasing the version](#increasing-the-version)
        - [Using the script](#using-the-script)
        - [Manually preparing the release](#manually-preparing-the-release)
- [Creating a Pull Request](#creating-a-pull-request)
- [Publishing on Github](#publishing-on-github)
- [Publishing on npm](#publishing-on-npm-manually)
    * [Login](#login)
    * [Publishing](#publishing)

## Preface
In this guide we cover the steps required to create and publish a new release of the `raiden-ts` package. To create a new release you need to update the version of the package and proceed to publish to `GitHub` and `npm`.

A new release might happen when a valid reason for it exists. Reasons for a new release include protocol upgrades, new features, bug fixes etc.

> Note! This only considers the SDK versioning and releasing and not the dApp.

Through this guide we assume that you work on a fork of the repository. We reference to the fork remote repository using `origin`, and to the Light Client repository using `upstream`.

## Preparing a new release
A new release starts with the increment of the package version. Ensure that you navigated in the project root directory.

In preparation for the release changes create a new branch:
```bash
git checkout -b prepare_release
```

Please ensure that you also update the [CHANGELOG.md](./raiden-ts/CHANGELOG.md) accordingly. You should have the changes for the new version tracked as `[Unreleased]`. You only need to replace `[Unreleased]` with the new version. 

### Increasing the version
Initially you need to decide if the new release would require `patch`, `minor`, `major` upgrade. For more information you can check the [npm version](https://docs.npmjs.com/cli/version) documentation.

#### Using the script

Then you can proceed with the version upgrade and commit creation. If you use an environment that can execute bash scripts then you can just run [prepare-release.sh](https://github.com/raiden-network/light-client/blob/master/prepare-release.sh). 

```bash
./prepare-release.sh
```

This script will bump the version according to the provided parameter and then it will create a commit with the message that looks like `0.22.0->0.22.1`.

#### Manually preparing the release
If for any reason you cannot run the script, you can proceed to prepare the release Pull Request manually.

Go to the `raiden-ts` directory to start bump the package version.

```bash
cd raiden-ts
```

Then run `pnpm version` to bump the version for`package.json`. Let's assume that we prepare for a new release containing a couple of minor bug fixes. You have to run the following command: 

```bash
pnpm version patch
```

Assuming `raiden-ts` was at version `0.22.0`, the command will update the package files' version tag to `0.22.1`. 


Then you need to create a new commit with the message `0.22.0->0.22.1`. After the new commit

```bash
git add package.json
git commit -m '0.22.0->0.22.1'
```

## Creating a Pull Request
After committing the CHANGELOG changes, along with the version bump you can proceed with the creation of the Pull Request.

Push your local branch to GitHub and proceed to create a Pull Request.

```bash
git push origin -u prepare_release
```

You need one approval for your Pull Request to get merged to master. After merging to master, you need to tag the release.

## Publishing on Github
Since you need to deal with the GitHub release interface we strongly suggested you use it for the creation of the tag too.

To draft a new GitHub release, visit the [release interface](https://github.com/kelsos/light-client/releases) and press the `Draft a new release` button. Then set `v0.22.1` as the `Tag version` and keep master as the `Target`. Then use `v0.22.1` as the release title.

Now you need prepare the release description. Don't forget to include the changelog entries for the specific version.

Proceed to publish the new release. A new release gets automatically tagged. Tagging will trigger the CI release flow that will also publish the artifact to `npm`.

## Publishing on npm (manually)
Regularily the publishing step will be handled automatically by the CI infrastructure. If for any reason the automatic publishing does not work you can alternatively publish the package manually to `npm`.
Before we proceed to publish on npm, we need to synchronize our local master with `upstream`.

```bash
git checkout master
git pull upstream master
```

> Note! Please keep in mind that you need to have the appropriate permissions to publish updates of the [raiden-ts](https://www.npmjs.com/package/raiden-ts) package.

### Login
If you never published an update before you, need to login to `npm` with the cli utility.

```bash
pnpm login
```  

You should follow the prompts displayed by the command. The command should create an `.npmrc` file in your home directory. This file contains your `authToken`. 

### Publishing
To publish you just need to run:

```bash
pnpm run publish --filter raiden-ts
```

The command will take care of the building and publishing of the package to `npm`.

Check the [npm publish](https://docs.npmjs.com/cli/publish) documentation for more information about the available flags.
