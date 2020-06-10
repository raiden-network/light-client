# Raiden Light Client API Development Guide

This guide is only a short extension of the main [guide](../CONTRIBUTING.md).
All definitions and decisions their do also apply here. The major addition of
this guide here is focused on the made design decisions.

## Goal

The main goal of the implementation is to be as much compatible with the
[official REST API
specification](https://raiden-network.readthedocs.io/en/latest/rest_api.html) as
possible. The user should be able to exchange the backend as they like, still
getting the same experience. This be not possible by 100%. Still, it must have
the highest priority while doing decisions on the routes.

## Git Commit Scope

As the main guide elaborates should each git commit message title be preceded
with a scope. This is namely `cli:` for this part of the repository.

## Design Decisions

### Functional

The implementation of the Raiden API with the light client's SDK should be
functional. Patterns like singletons for the Raiden service instance and similar
are not accepted. Therefore modules export functions **explicitely** so that
they can be bound to a global context. Namely applying or binding them to
a specific context as `this`. This approach allows to easily share and change
certain instances all other the place. Furthermore does it provide a simple
interface to make the implementation testable. After all is it possible to have
multiple instances of the REST application running on different servers with
possibly different Raiden services and configuration.

### User Input Validation

The validation of user input through the endpoints should be on a bare minimum.
In fact is the higher goal to provide the full validation by the SDK. The SDK
will throw different errors for the certain cases. The task of the API server is
to parse these errors properly to translate them to the correct messages as the
specification defines them. This simplifies the whole implementation, while
keeping the error handling at one place. Such includes also more complex errors
like a too low balance and similar.
There will be always a small rest of validation for the API. The SDK interface
must and will not match exactly the definitions of the specification. A perfect
example would be the channels endpoint to query and filter them. The
specification requires that an wrongly formatted Ethereum address parameter
cause a `404` error response. Since the filtering of channels happens in the
routes and not the SDK, these will also check for the addresses to be correct
and throw if not. But they use the same codecs as the SDK does and no other
validation sources.
