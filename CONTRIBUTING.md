# Raiden Light Client Development Guide

Welcome! This guideline explains how to contribute to the Raiden Light Client
codebase. It's here to help you to understand what development practises we use
and what the requirements for a pull request are to be opened against Raiden Light Client repository.

## Table of Contents

- [Contributing](#contributing)
- [Creating an issue](#creating-an-issue)
  - [Request features](#request-features)
  - [Report bugs](#report-bugs)
- [Creating a rull request](#creating-a-pull-request)
  - [Installation](#installation)
  - [Code style](#code-style)
    - [Observables](#observables)
    - [Vue components](#vue-components)
    - [CSS naming](#css-naming)
  - [Writing and running tests](#writing-and-running-tests)
  - [Documentation](#documentation)
  - [Committing rules](#committing-rules)
  - [Change log entry](#change-log-entry)
  - [Opening a pull request](#opening-a-pull-request)
    - [Getting it reviewed](#getting-it-reviewed)
    - [Contributing to other pull requests](#contributing-to-other-pull-requests)
  - [Merging pull requests](#merging-pull-requests)

## Contributing

There are two ways for you to contribute. You can either open
an issue or, if you have programming experience, open a pull request.

## Creating an issue

If you experience a problem while using the Raiden Light Client or want to request a feature,
then you should open an issue against the repository.

### Request features

If you want to submit a feature request, please use the **User Story** issue template and make sure that it contains the following aspects:

- A description of what you would like to see implemented
- An explanation of your use case

### Report bugs

If you have found a bug in the Light Client or the JS SDK, then please use the **Bug** issue template and provide the following infos:

- A short description of the problem.
- The steps you need take in order to reproduce the behavior
- What was the expected result
- What was the actual result

## Creating a pull request

If you have coding experience and would like to contribute to codebase, then you can open a pull request against the repository.

If you are interested in contributing make sure that there is an issue about it. Express interest, by picking the issue so that core developers know that you are working on the issue.

All pull requests should be:

- Self-contained.
- As short as possible and address a single issue or even a part of an issue.
  Consider breaking long pull requests into smaller ones.

### Installation

These are the required external dependencies for development:

- Node >=10.13.0
- A Web3 enabled browser (e.g. through [MetaMask](https://metamask.io))
- git

Start by getting the source code:

```bash
$ git clone --recurse-submodules https://github.com/raiden-network/light-client.git
$ cd light-client
```

### Code style

The code style is enforced by [ESLint](https://eslint.org), which means that in most cases you don't need to do anything other than running:

```bash
$ npm run lint
```

To automatically fix any fixable codestyle issue in the SDK or Light Client, you may add to the `lint` command the `--fix` option.

#### Observables

Functions that return observables should have `$` as suffix, e.g.:

```javascript
myFunction$(): Observable<RaidenAction>
```

#### CSS naming

For CSS naming we try to follow the [BEM](http://getbem.com/) methodology. Additionally, we use [SASS](https://sass-lang.com) to structure our style rules. Please nest related elements within their blocks.

👎 Instead of writing:

```CSS
.my-block__my-element--my-modifier {
    ...
}
```

👍 Do this:

```CSS
.my-block {
    ...

    &__my-element {
        ...

        &--my-modifier {
            ...
        }
    }
}
```

Along with the naming, you should try to scope the styles in their respective components.

### Writing and running tests

When developing a feature, or a bug fix you should always start by writing a
**test** for it, or by modifying existing tests to test for your feature.
Once you see that test failing you should implement the feature and confirm
that all your new tests pass.

Your addition to the test suite should call into the innermost level possible
to test your feature/bugfix. In particular, integration tests should be avoided
in favor of unit tests whenever possible.

For the sdk you have to run the following:

```bash
$ cd raiden-ts
$ npm run test

```

For the dApp:

```bash
$ cd raiden-dapp
$ npm run test:unit
```

Tests are split in unit tests, and integration tests. The first are faster to execute while
the latter test the whole system but are slower to run.

By default whenever you make a Pull Request the linter tests, format checks, unit tests and all the integration tests will run.


### Documentation

In the SDK we use [Typedoc](https://typedoc.org) to generate it's [API documentation](https://lightclient.raiden.network/docs/classes/raiden.html). Therefore, please write [doc comments](https://typedoc.org/guides/doccomments/) for functions that are exposed.

### Committing rules

For an exhaustive guide read [this](http://chris.beams.io/posts/git-commit/)
guide. It's all really good advice. Some rules that you should always follow though are:

- A commit title not exceeding 50 characters
- A blank line after the title (optional if there is no description)
- A description of what the commit did (optional if the commit is really small)

Why are these rules important? All tools that consume git repos and show you
information treat the first 80 characters as a title. Even Github itself does
this. And the git history looks really nice and neat if these simple rules are
followed.

### Change log entry

If your pull request adds or removes a feature or eliminates a bug, then it **has to** contain a change log entry as well. We use the [keep a changelog format](https://keepachangelog.com/en/1.0.0/) for ours.

We maintain two separate change logs, one for the SDK and another one for the dApp. They can be found at:
```
raiden-ts/CHANGELOG.md
raiden-dapp/CHANGELOG.md
```

Please categorize your entry according to the type of your change. The most commonly used ones are `Added`, `Fixed`.

👎 Instead of committing for a bug fix:

```markdown
### Added
- A bug fix
```

👍 Do this:

```markdown
### Fixed
- [#777] Specific behavior

...

[#777]: https://github.com/raiden-network/light-client/issues/777
```

### Opening a pull request

In order for a Pull Request to get merged into the main repository you should
have one approved review from one of the core developers of Raiden. Additionally, all
continuous integration tasks should pass and the build should be green.

You also need to sign the raiden project CLA (Contributor License
Agreement). Our CLA bot will help you with that after you created a pull
request. If you or your employer do not hold the whole copyright of the
authorship submitted we can not accept your contribution.

For frequent contributors with write access to the repository we have a set of rules on pull requests to signal to our colleagues what their current state is:

- **Ready for review**: Means that you consider your work done and it is currently waiting for a review
- **Draft**: Is considered work in progress and it is not yet ready for a review

#### Getting it reviewed

It is the responsibility of the author to ask for at least one person for a review. The person should know the area of the code being changed. If the chosen reviewer does not feel confident in the review, they can then ask for someone else to additionally look at the code.

All the developers in the team should review [open pull requests](https://github.com/raiden-network/light-client/pulls) frequently.

We have a lot of tools that automatically check the quality of the code (eslint, prettier). All these are automatically ran by the CI. Therefore, fixes related to linting are usually not included in reviews.

Additionally, reviewers should **not be nitpicky** about the suggested changes they ask from the author. If something is indeed nitpicky then the reviewer is encouraged to state it beforehand. Example:

> nitpick: I don't really think XYZ makes sense here. If possible it would be nice to have it changed to KLM

The author of the pull request can choose to implement the feedback or to ignore it.

Authors should make pull request reviews easier. Make them **as small as possible** .

For complicated pull requests, that touch the core of the protocol, at least 2 core developers are recommended to have a look and provide an opinion.

When you have trouble to do a review, it is recommended to clone the branch locally and explore the changes with your editor. Run tests and experiment with the changes, so that you can get a better understanding of the changes and give feedback to the author.

#### Contributing to other pull requests

If you are a core developer of Raiden with write privileges to the repository
then you can add commits or rebase to master any Pull Request by other people.
Before doing so, please make sure to communicate and sync this with the owner of
the Pull Request.

Let us take [this](https://github.com/raiden-network/raiden/pull/221) pull request as an
example. The contributor has everything ready and all is looking good apart
from a minor glitch. You can wait until he fixes it himself but you can always
help him by contributing to his branch's pull request:

```bash
$ git remote add hackaugusto git@github.com:hackaugusto/raiden.git
$ git fetch hackaugusto
$ git checkout travis_build
```

Right now you are working on the contributor's pull request. **Make sure** to
coordinate to avoid any conflicts and always warn people beforehand if you are
to work on their branch. Once you are done:

```bash
$ git commit -m 'Add my contribution

The PR was missing something. I added it.'
$ git push hackaugusto travis_build
```

### Merging pull requests

Once your pull request got approved, it is **your responsibility** to merge it. When merging a pull request into the codebase, there are different options to go about it:

- Rebase and Merge
- Create a Merge commit
- Squash and Merge

We do not enforce any specific way, but want to keep the git history **as flat as possible**.

If you feel like the individual commits of your pull request are of importance, feel free to **Merge Commit** or **Rebase and Merge**.

If your pull request contains a lot of unimportant commits, e.g. syncs with `master` or intermediate commits, then please use **Squash and Merge**.
