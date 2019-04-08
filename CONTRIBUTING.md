# Raiden Light Client Development Guide

Welcome! This guide serves as the guideline to contributing to the Raiden Light Client
codebase. It's here to help you understand what development practises we use here
and what are the requirements for a Pull Request to be opened against Raiden Light Client.

- [Contributing](#contributing)
  - [Creating an Issue](#creating-an-issue)
  - [Creating a Pull Request](#creating-a-pull-request)
  - [Pull Request Reviews](#pull-request-reviews)
- [Development environment setup](#development-environment-setup)
- [Development Guidelines](#development-guidelines)
  - [Coding Style](#coding-style)
  - [Workflow](#workflow)

## Contributing

There are two ways you can contribute to the development. You can either open
an Issue or if you have programming abilities open a Pull Request.

### Creating an Issue

If you experience a problem while using the Raiden Light Client or want to request a feature
then you should open an issue against the repository. All issues should
contain:

**For Feature Requests:**

- A description of what you would like to see implemented.
- An explanation of why you believe this would make a good addition to Raiden Light Client.

**For Bugs:**

- A short description of the problem.
- Detailed description of your system, SDK version, environment (e.g. Metamask), Wallet version if you are using the wallet.
- What was the exact unexpected thing that occured.
- What you were expecting to happen instead.

### Creating a Pull Request

If you have some coding abilities and would like to contribute to the actual
codebase of Raiden then you can open a Pull Request(PR) against the repository.

If you are interested in contributing make sure that there is an issue about it. Express interest, by picking the issue so that core developers know that you are working on the issue.

All PRs should be:

- Self-contained.
- As short as possible and address a single issue or even a part of an issue.
  Consider breaking long PRs into smaller ones.

In order for a Pull Request to get merged into the main repository you should
have one approved review from one of the core developers of Raiden and also all
Continuous Integration tests should be passing and the CI build should be
green.

Additionally you need to sign the raiden project CLA (Contributor License
Agreement). Our CLA bot will help you with that after you created a pull
request. If you or your employer do not hold the whole copyright of the
authorship submitted we can not accept your contribution.

For frequent contributors with write access to the repository we have a set of labels to put on Pull Requests to signal to our colleagues what the current state of the PR is. These are:

- [Dev: Please Review](https://github.com/raiden-network/light-client/labels/dev%3A%20Please%20Review) to a Pull Request that is currently ready for a reviewer to have a look at.
- [Dev: Work in Progress](https://github.com/raiden-network/light-client/labels/dev%3A%20Work%20In%20Progress) to a Pull Request that is either not yet ready for review or is getting PR review suggestions applied by the author until it's ready for review again.

### Pull Request Reviews

It is the responsibility of the author to ask for at least one person to review their Pull Request. That person should know the area of the code being changed. If the chosen reviewer does not feel confident in the review, they can then ask for someone else to additionally look at the code.

All the developers in the team should perform Pull Request reviews. Make it a habit to check [this](https://github.com/raiden-network/light-client/pulls?q=is%3Apr+is%3Aopen+label%3A%22dev%3A+Please+Review%22) link often to help your fellow colleagues who have PRs open pending for review.

We have a lot of tools that automatically check the quality of the code (eslint, prettier). All these are automatically ran by the CI. Therefore fixes related to linting are not usually part of PR reviews. Additionally reviewers are encouraged to not be nitpicky about the suggested changes they ask from the PR author. If something is indeed nitpicky then the reviewer is encouraged to state it beforehand. Example:

> nitpick: I don't really think XYZ makes sense here. If possible it would be nice to have it changed to KLM

The author of the PR can then choose to implement the nitpicks or ignore them.

PR authors should make pull request reviews easier. Make them as small as possible and even if some code is touched it does not mean that it needs to be refactored. For example don't mix style/typing changes with a big PR.

When a reviewer starts a PR review he should write a comment in the PR stating he is doing so. For example:

> Reviewing this now

This is to keep track of who is reviewing a PR and to also know when a PR review is ongoing.

For complicated PRs that touch the core of the protocol at least 2 core developers are recommended to have a look and provide an opinion.

When performing a PR review of non trivial PRs it is recommended to clone the branch locally, explore the changes with your editor, run tests and experiment with the changes so that a better understanding of the code change can be achieved and good constructive feedback given back to the author.

## Development environment setup

### Development external dependencies

These are the required external dependencies for development:

- Node >=10.13.0
- A Web3 enabled browser (Either via Metamask or any other environment that can run dApps for the wallet).
- Git for version control.

### Get the code

Start by getting the source code

    git clone https://github.com/raiden-network/light-client.git
    cd raiden

#### Install system wide dependencies

##### Archlinux

All the required packages are available in community or extra:

    sudo pacman -Sy nodejs npm base-devel git

##### Debian/Ubuntu

Then install the required packages:

    sudo apt-get install build-essential git libffi-dev libgmp-dev libssl-dev \
    libtool pkg-config nodejs npm git

### Testing

The unit tests use jest:

For the sdk you have to run the following:

```bash
    cd raiden
    npm run test

```

For the wallet:

```bash
    cd raiden-wallet
    npm run test:unit
```

Tests are split in unit tests, and integration tests. The first are faster to execute while
the latter test the whole system but are slower to run.

### Testing on the CI

By default whenever you make a Pull Request the linter tests, format checks, unit tests and all the integration tests will run.

### Commiting Rules

For an exhaustive guide read [this](http://chris.beams.io/posts/git-commit/)
guide. It's all really good advice. Some rules that you should always follow though are:

- A commit title not exceeding 50 characters
- A blank line after the title (optional if there is no description)
- A description of what the commit did (optional if the commit is really small)

Why are these rules important? All tools that consume git repos and show you
information treat the first 80 characters as a title. Even Github itself does
this. And the git history looks really nice and neat if these simple rules are
followed.

### Documentation

Code should be documented.

### Coding Style

The code style is enforced by [prettier](https://prettier.io/) which means that in most of the cases you don't actually need to do anything more than running the appropriate task.

#### SDK

#### Wallet

To fix any codestyle issues in the wallet you just have to run:

```bash
npm run lint
```

##### HTML formating

There are some scenarios where prettier will break a template in a weird way:

```html
<template
    ><section>
        <div>
        <div>
            <div><p>paragraph</p></div>
        </div>
        </div>
    </section></template
    >
```

In this case you should go and add line breaks so that the template appears in proper way.

```html
<template>
    <section>
        <div>
            <div>
                <div><p>paragraph</p></div>
            </div>
        </div>
    </section>
</template>
```

##### Vue bindings

For consistency reason the [shorthand](https://vuejs.org/v2/guide/syntax.html#Shorthands) vue bindings are used all across the wallet instead of the full syntax.

```html
<!-- full syntax -->
<a v-bind:href="url"> ... </a>

<!-- shorthand -->
<a :href="url"> ... </a>
```

```html
<!-- full syntax -->
<a v-on:click="doSomething"> ... </a>

<!-- shorthand -->
<a @click="doSomething"> ... </a>
```

##### Vue components

When using custom vue components in templates make sure to use the kebab case name of the components.

Don't do this:

```html
<template>
  <v-container>
    <NoValidProvider v-if="!providerDetected" />
    <UserDenied v-else-if="userDenied" />
    <WalletCore v-else />
  </v-container>
</template>
```

The for consistensy you should use:

```html
<template>
  <v-container>
    <no-valid-provider v-if="!providerDetected" />
    <user-denied v-else-if="userDenied" />
    <wallet-core v-else />
  </v-container>
</template>
```

### Workflow

When developing a feature, or a bug fix you should always start by writing a
**test** for it, or by modifying existing tests to test for your feature.
Once you see that test failing you should implement the feature and confirm
that all your new tests pass.

Your addition to the test suite should call into the innermost level possible
to test your feature/bugfix. In particular, integration tests should be avoided
in favor of unit tests whenever possible.

Afterwards you should open a Pull Request from your fork or feature branch
against master. You will be given feedback from the core developers of raiden
and you should try to incorporate that feedback into your branch. Once you do
so and all tests pass your feature/fix will be merged.

#### Contributing to other people's PRs

If you are a core developer of Raiden with write privileges to the repository
then you can add commits or rebase to master any Pull Request by other people.

Let us take [this](https://github.com/raiden-network/raiden/pull/221) PR as an
example. The contributor has everything ready and all is looking good apart
from a minor glitch. You can wait until he fixes it himself but you can always
help him by contributing to his branch's PR:

```bash
git remote add hackaugusto git@github.com:hackaugusto/raiden.git
git fetch hackaugusto
git checkout travis_build
```

Right now you are working on the contributor's Pull Request. **Make sure** to
coordinate to avoid any conflicts and always warn people beforehand if you are
to work on their branch. Once you are done:

```bash
git commit -m 'Add my contribution

The PR was missing something. I added it.'
git push hackaugusto travis_build
```

Congratulations, you have added to someone else's PR!

#### Integrating Pull Requests

When integrating a successful Pull Request into the codebase we have the option
of using either a "Rebase and Merge" or to "Create a Merge commit".
Unfortunately in Github the default option is to "Create a Merge commit". This
is not our preferred option as in this way we can't be sure that the result of
the merge will also have all tests passing, since there may be other patches
merged since the PR opened. But there are many PRs which we definitely know
won't have any conflicts and for which enforcing rebase would make no sense and
only waste our time. As such we provide the option to use both at our own
discretion. So the general guidelines are:

- If there are patches that have been merged to master since the PR was opened,
  on top of which our current PR may have different behaviour then use **Rebase
  and Merge**.
- If there are patches that have been merged to master since the PR was opened
  which touch documentation, infrastucture or completely unrelated parts of the
  code then you can freely use **Create a Merge Commit** and save the time of
  rebasing.
