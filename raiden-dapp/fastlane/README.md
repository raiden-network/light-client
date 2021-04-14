# Fastlane

[Fastlane](https://docs.fastlane.tools/) is a tool to automate and simplify the
whole process of bundling mobile applications and upload them to their app
stores. For our use-case it is meant to be used by the continuous integration
pipeline. There it is part of the regular task around the release management.

It is unlikely that a developer has to run any _Fastlane_ action on his local
machine except for special debug/setup purposes. Nevertheless the following
instructions should target both environments, continuous integration and local
machines.


## Pre-requisites

- Make sure _Ruby_ and its package manager `bundler` are available and executable
  (`ruby --version` & `which bundler`). _Fastlane_ is written in _Ruby_ and can be
  extended with plugins and other _RubyGems_.
- For _Android_ releases, make sure that the _Java_ environment is installed like
  the _Gradle_ package manager (comes automatically if _Android Studio_ is
  installed).
- For _iOS_ releases, make sure that the _XCode_ tool-box is installed (only
  works on Mac).
- Make sure `yarn` is executable to build the Raiden Light Client dApp itself.


## Installation

Install all _Ruby_ dependencies for _Fastlane_ and its plugins.

```sh
$ bundler install
```

## Setup

The _Fastlane_ actions need some access to secret data. Such are keys to sign
bundles, getting access to the stores and more. These secrets are placed in two
different locations. Secret documents are stores in `./raiden-dapp/keyfiles/`.
Secret environment variables (e.g. passwords) are collected inside
`./raiden-dapp/fastlane/.env.secrets`. The latter gets sourced by _Fastlane_
itself automatically. It should not be sourced to the regular shell manually.

**IMPORTANT**
Secret data must **never** be checked into the version control system**!!** The
locations used per default (as listed above) are set to be ignored. Please
don't `--force` add any of them. Also make sure that when ever a new location gets
added that is not ignored yet, to extend the `.gitignore` patterns to include
it.

Secret documents and variables can be retrieved from the `1password` password
manager hosted internally by the company. Within `1password` you must get
authorized for the `Raiden App Stores` vault. The documents are named correctly
so that they can be directly copied into the `keyfiles` directory. The variables
in `.env.secrets` are named to be very explicit about what they expect. So do
passwords for key documents refer to the file name they relate to. Keystore
password can be found in the same entry as their documents in `1password`.

Example: Google Play Store upload keystore
  - locate the `Google Play Store Upload Keystore` entry in the vault
  - download the document locally into the `keyfiles` directory with the origin
    name (i.e. `google_play_store_upload_keystore.jks`)
  - copy the `.env.secrets.template` file if there is no `.env.secrets` file yet
  - locate the `GOOGLE_PLAY_STORE_UPLOAD_KEYSTORE_PASSWORD` variable
  - replace the placeholder value wit the password stored in the `1password`
    document entry


## Usage

At the moment of writing the _Fastlane_ actions are quite limited and only
meant for releases to the internal test track. This will be changed/extended in
future when the mobile application of the project gets a mature product.

The basic syntax is `bundle exec fastlane <platform> <lane>`. So for example
`bundle exec fastlane android deploy_internal_test_draft` will build the dApp,
assemble it with _Capacitor_, build the application bundle and upload it to the
Google Play Store repository.
