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

- Make sure _Ruby_ (`v2.5.0`) and its package manager _bundler_ (`v2.4.15`) [are
  installed](https://www.ruby-lang.org/en/documentation/installation/) and
  executable (`ruby --version` & `which bundler`). _Fastlane_ is written in
  _Ruby_ and can be extended with plugins and other _RubyGems_.
- For _Android_ releases, make sure that the _Java_ environment is installed like
  the _Gradle_ package manager (comes automatically if _Android Studio_ is
  installed).
- For _iOS_ releases, make sure that the _XCode_ tool-box is installed (only
  works on Mac).
- Make sure `yarn` is executable to build the Raiden Light Client dApp itself.
- The first few steps of the dApp's [installation
  instructions](https://github.com/raiden-network/light-client#install-and-run-the-dapp)
  have been executed including the build of the SDK.


## Installation

Install all _Ruby_ dependencies for _Fastlane_ and its plugins. Execute this
command inside the `raiden-dapp/` directory.

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

**NOTE**
The following instructions are targeting a release to the app store repositories
owned by the Raiden project creators. Anyone else who tries to publish the dApp
to their own repository needs to adapt it to their own secrets. Anyway this
should give the user a good idea of what secrets are necessary and where does
the setup here expect to find them.

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

List of requirement secret documents (at `keyfiles/`):
  - `google_play_store_access_key.json`
  - `google_play_store_upload_keystore.jks`


## Usage

At the moment of writing the _Fastlane_ actions are quite limited and only
meant for releases to the internal test track. This will be changed/extended in
future when the mobile application of the project gets a mature product.

The basic syntax is `bundle exec fastlane <platform> <lane>`. So for example
`bundle exec fastlane android deploy_internal_test_draft` will build the dApp,
assemble it with _Capacitor_, build the application bundle and upload it to the
Google Play Store repository.


## Troubleshooting

This sections tries to list some "common"/known errors which could occur and how
to solve them.

```
FAILURE: Build failed with exception
...
    > SDK location not found. Define location with an ANDROID_SDK_ROOT environment variable or...
```

For this error you just need to follow the instructions of the message.
Therefore you must to determine where the Java SDKs are stored on your computer.
This highly depends on your local setup. If you used _AndroidStudio_ you can
determine the location in the settings (`Ctrl+Alt+S`) at `Appereance & Behavior > System Settings > Android SDK`
and watch out for the `Android SDK Location` property to copy its value.
Then you need to set this environment variable in you shell. For example you can
set it temporally via `export ANDROID_SDK_ROOT="<your-path-here>"`.
Alternatively you can make it somehow persistent in your personal shell setup or
use a `.env` file that gets sourced.

---

```
Could not determine the dependencies of task ':app:compileReleaseJavaWithJavac'.
> Failed to install the following Android SDK packages as some licences have not
> been accepted.
     build-tools;30.0.2 Android SDK Build-Tools 30.0.2
```

In case _AndroidStudio_ is used, this can be simply done using the [SDK
Manager](https://developer.android.com/studio/intro/update#sdk-manager) in the
IDE.

---

```
Execution failed for task ':app:processReleaseMainManifest'.
> Unable to make field private final java.lang.String java.io.File.path
> accessible: module java.base does not "opens java.io" to unnamed module
> @43c003c7
```

Make sure that _Java Development Kit (JDK)_ version is older or equal to `15.x`.
