<h2 align="center">
  <br/>
  <a href='https://raiden.network/'><img
      width='400px'
      alt=''
      src="https://user-images.githubusercontent.com/35398162/54018436-ee3f6300-4188-11e9-9b4e-0666c44cda53.png" /></a>
  <br/>
  Raiden Light Client SDK Development
  <br/>
</h2>

<h4 align="center">
  Architecture description, code style and patterns, tips & tricks, caveats, typing and pits to avoid!
</h4>

The Raiden Light Client SDK requires a Web3 provider like [MetaMask](https://metamask.io) or [Geth](https://geth.ethereum.org) and is built on the following concepts and libraries:

- Functional programming
- [Redux](https://redux.js.org) architecture
- Strictly typed data models aided by [io-ts](https://github.com/gcanti/io-ts)
- [RxJS](https://rxjs.dev/) Observables asynchronous tasks through [redux-observable](https://redux-observable.js.org) Epics
- Off-chain communication through [WebRTC](https://webrtc.org) and [Matrix](https://matrix.org) servers using the [wrtc](https://github.com/node-webrtc/node-webrtc) and [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk) libraries
- [PouchDB](https://pouchdb.com/) database for state storage/persistency

Below is a detailed explanation of the SDK architecture as well as things to keep in mind when reading the code and writing new functionality.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Architecture](#architecture)
  - [Vertical (Stack)](#vertical-stack)
  - [Horizontal (Folder Structure)](#horizontal-folder-structure)
- [Typing System](#typing-system)
  - [Branded types](#branded-types)
  - [A note about `io-ts` and type complexity](#a-note-about-io-ts-and-type-complexity)
- [Public API](#public-api)
- [Actions](#actions)
- [Reducers](#reducers)
- [Epics](#epics)
  - [Hints, tips & tricks and pits to keep an eye on developing epics:](#hints-tips--tricks-and-pits-to-keep-an-eye-on-developing-epics)
- [Testing](#testing)
  - [Unit tests](#unit-tests)
  - [e2e tests](#e2e-tests)
- [Debugging](#debugging)
  - [Browser/live session:](#browserlive-session)
  - [With tests](#with-tests)

## Architecture

In this section we will dive into the the internal machinery of the SDK and outline how RxJS, Redux and Epics work together.

### Vertical (Stack)

Instead of using classes as in object-oriented programming, the SDK is written in a functional way and uses functions and type schemas like interfaces to separate logic and data.

The main entrypoint and one of the only classes in the SDK is [Raiden](classes/raiden.html), which provides access to all functionality. It is instantiated through the [`async Raiden.create`](classes/raiden.html#create) static factory. This method returns a ready-to-use `Raiden` client object which instantiates and starts a central Redux `store`.

The Redux `store` is responsible for handling the **actions** that change the **state** through the **reducers**.

All **actions** go through the **Epics** (observables factory functions) middleware where synchronous and asynchronous tasks can be performed with the help of **observables** (pipe/chains of operator functions which acts on input actions and state changes, and output actions as result). Any new action that is output gets fed back to the Redux store and continues down this _actions pipeline_.

The `Raiden` client dispatches **request** actions to the `store` and waits for a respective **success** or **failure** to flow through the actions pipeline. These actions are created using [createAction](https://github.com/raiden-network/light-client/blob/9abc8aac99b800ffbd127a6edb278b653fc9a450/raiden-ts/src/utils/actions.ts#L68) and [createAsyncAction](https://github.com/raiden-network/light-client/blob/master/raiden-ts/src/utils/actions.ts#L218) with the [Flux Standard Action](https://github.com/redux-utilities/flux-standard-action) schema/pattern.

All the business logic is contained in `Epics`. They accept a dependencies object as third parameter, which acts as a dependency injector (DI) and contains everything from configuration variables to the Ethers `Provider` instance. The `Epics` are factories that receive the `actions$` and `state$` observables and dependencies and output cold observables of new actions. They can listen and react to any kind of event or observable once subscribed.

The Blockchain interaction happens through [ethers](https://github.com/ethers-io/ethers.js). [TypeChain](https://github.com/ethereum-ts/TypeChain) runs at build time and generates type declarations for the contracts. Both `Ethers` and `TypeChain` are available as dependencies at construction time.

Matrix interaction is done through `matrix-js-sdk`, but as it needs more complex async initialization (password signing, syncing, etc), it uses a initialization time epic which then makes the `MatrixClient` instance available through a `matrix$: AsyncSubject` dependency.

A visual representation of the inner architecture:

```
      user method calls
         |
      +--v-------------+
      |                |
      |   Raiden       |      dependencies
      |                +------------------------+
      +-+--------------+                        |
        |                       redux store     |
        |   +-------------------------------+   |
        |   |                               |   |
        v   |  action$       +-----------+  |   |
        +---+----------+---->+  reducer  |  |   |
        ^   |          |     +-----+-----+  |   |
        |   |          |           |        |   |
        |   +----------+-----------+--------+   |
        |              |           |            |
        |              |           |state$      |
        |              |           |            |
        |         +----v-----------v------------v--+
        |         |                                |
        |         |            Epics               |
        |         |                                |
        |         +------+--------^-------------^--+
        |                |        |             |
        +--------<-------+        |             |
         output actions     +-----v------+   +--v-----------+
                            |            |   |              |
                            |  Ξ ethers  |   |  Transport   |
                            |            |   |              |
                            +------------+   +--------------+
```

### Horizontal (Folder Structure)

The project is structured in a domain-driven logic, each folder under `src` represents a semantic domain and should depend on the things inside of it as much as possible. Especially for _actions_\*_, \_reducers_, _epics_, _state_ and specific \*functions\*.

- `abi`, `contracts` and `deployment` are auto-generated data directories and don't contain any logic.
  - `abi` and `deployment` contains information about the deployed Raiden contracts for the Ethereum test networks, generated by `copyContracts.js` script at `prepare` time;
  - `contracts` is the output of the [TypeChain](https://github.com/ethereum-ts/TypeChain) contracts interfaces used for type safety, auto-generated from `abi`;
- [`utils`](https://github.com/raiden-network/light-client/tree/master/raiden-ts/src/utils) are common functions and types for the whole Light Client. The code here should not depend on any other SDK modules but can depend on external libraries.
- [`channels`](https://github.com/raiden-network/light-client/tree/master/raiden-ts/src/channels) is the contracts logic for the blockchain and channel manager. This is mostly code for listening to events and perform blockchain actions like opening a channel, detecting a deposit or informing that a closed channel is settleable.
- [`transport`](https://github.com/raiden-network/light-client/tree/master/raiden-ts/src/transport) is for the off-chain transport/communication. It is mainly matrix code, like login and initialization logic, room creation, invite and maintenance tasks as well as the actually sending and receiving of text messages between Raiden nodes; WebRTC is an optional faster p2p protocol, signaled through `matrix`, and also part of the transport;
- [`messages`](https://github.com/raiden-network/light-client/tree/master/raiden-ts/src/transport) are the messages data models and validation and serialization/deserialization utils.
- [`transfers`](https://github.com/raiden-network/light-client/tree/master/raiden-ts/src/transfers) contains the transfers and withdraw logic, life cycle and validation; withdraw is present here because as well as transfers, they may change a channel state, and must be done in a locked context;
- [`services`](https://github.com/raiden-network/light-client/tree/master/raiden-ts/src/services) is logic related to interactions with [Raiden services](https://github.com/raiden-network/raiden-services).
- [`db`](https://github.com/raiden-network/light-client/tree/master/raiden-ts/src/db) holds code responsible for syncing, saving and retrieving state from the persistence database;
- [`./src`](https://github.com/raiden-network/light-client/tree/master/raiden-ts/src) contains the `Raiden` client and public API, root, Epic, Reducer, Action, specific types, constants etc. Anything that should be _global_.

These are just suggestions on how to keep a well organized codebase. It is the developer's responsibility to decide in which module/domain any function, data or type belongs.

## Data Persistence

The visual representation of the data handling and persistance:

```
                         +--------------------+
                         |       State        |
          .............. |      [Redux]       | <.............
          .              |    (in memory)     |              .
          .              +--------------------+              .
          .                        ^                         .
          .                        .                         .
   async sync back         load data on start        read historic data
          .                        .                         .
          .                        .                         .
          .              +--------------------+              .
          .              |     Database       |              .
          .............> |     [PouchDB]      | ..............
                         |(persistent storage)|
                         +--------------------+
                                   ^
                                   |
          +------------------------+------------------------+
          |                        |                        |
+--------------------+   +--------------------+   +--------------------+
|  LevelDB Adapter   |   | IndexedDB Adapter  |   |   Memory Adapter   |
|     (NodeJS)       |   |   (Web-Browser)    |   |      (Tests)       |
+--------------------+   +--------------------+   +--------------------+
```

Additional notes:

- The database adapter gets chosen based on the environment the SDK is running inside.
- The hot state in memory with Redux is limiting its size by not including historic transfers data.
- The data synchronization from the memory to the storage does not block the protocol logic and gets minimized by state diffs. It's performed by a `persister` middleware.
- During shutdown/stop, the final data synchronization is been safely awaited for.
- The database is used as source to do dump or upload backups (can be transferred between clients).
- Old database scheme versions get automatically migrated during startup before the load to the Redux state.
- Clients requests which try to read historic data might be slower due to the database read, while all protocol relevant operations are blazing fast, operating on the in-memory state.

## Typing System

TypeScript helps us check for correctness and aid implementation, validation and integration of various parts of the codebase. We can tell TypeScript what type of argument, return value or variable is expected in a function which helps us avoid passing wrong types when writing our code, like passing a number to a function that expects a string.

However, when we are dealing with unknown data we cannot always be sure it matches our expectations. To bridge this gap we use the [`io-ts`](https://github.com/gcanti/io-ts) library.

`io-ts` solves this by allowing you to create **codecs**: actual runtime objects which are able to verify the schema (e.g. outline and types) of any data, validating it and type guarding your code. They're also able to decode data from some (usually a more primitive) input type to the expected runtime instance/value, as well as encode a value to a given output format. Better yet, each codec have an associated compile-time **type**, to tell TypeScript what the output data of a codec looks like, allowing TypeScript to do its magic without needing to declare twice your data structure (one for runtime validation, other for compile-time type checks).
Finally, codecs can be composed in almost any way supported by TypeScript, making it very powerful. Example:

```typescript
import * as t from 'io-ts';
const Data = t.type({ key: t.number }); // this is the codec, a real object
type Data = t.TypeOf<typeof Data>; // this is the type for the above codec, actually: { key: number; }
const mydata = JSON.parse('{ "key": 123 }'); // mydata type is any
const decoded = Data.decode(mydata); // decoded is Either an error (left) or the expected value (right)
if (decoded.isLeft()) throw decoded.value;
// from now on, decoded.value is known to be of type Data, thus mydata.key is number
const sq: number = Math.pow(decoded.value.key, 2);
```

We use `io-ts` to validate unsafe data and provide strong guarantees, define our own codecs to serialize and deserialize custom objects, and provide typeguards to narrow broader types to more specific ones.

### Branded types

TypeScript branded types (aka. refinements, or poor man's nominal typing) helps developers provide validators about specific types which can be compared to full inheritance systems in OOP paradigms. It consists basically of making a branded type `TB` as the intersection of base type `A` with some brand `B`, which makes the branded type more specific. So, `type TB = number & { brand }` is equivalent in OO of making an inherited/child class `TB` extending `number`. You can still pass `TB` where `number` is expected (and it's a child of number), but you can't pass a simple `number` where `TB` is expected unless you type-cast, assert or decode/validate it as such.

On TypeScript, all this normally happens only at compile-time (the brand usually is just an interface with a `unique symbol`), having no impact at runtime, when the variable would effectivelly be a simple `number`. `io-ts` allows us to have codecs which also validate if a parent type matches the expectations to be considered a branded/child type, allowing us to also have specific type safety beyond just validating if some data is a `string` or not.

For example, in our [types](https://github.com/raiden-network/light-client/tree/master/raiden-ts/src/utils/types.ts), we declare the type `Address`, which is (actually) a `string`, which happens to be validated to also be a `HexString` of size `20 bytes`, and which also happens to be in the checksummed format, without ceasing to be a `string`!

We try to make all the types we use as strict as needed, specially considering externally-originated data, like messages, as the security of the system may depend on doing the right thing, always. With proper TypeScript usage and tools (like `io-ts` and type-safe actions), we should always be able to narrow down the data type we're using in any part of the code. Avoid acting on `any`-typed data, much less declaring it as so. Literals and tagged unions help a lot to keep narrow/strict types whenever needed, with `if`, `throw`, `typeof` and even explicit typeguard functions. This way, we'll get the compiler to help development and enforce correctness.

### A note about `io-ts` and type complexity

While developing our more complex types, we noticed a significant slowdown on TypeScript transpilation time (taking up to 5min), which also heavily affected `tsserver` for Intellisense, auto-completion, type validation, and also expressed itself as `.d.ts` declaration files of tens of MBs in size.

Further investigation have shown that this was caused by TypeScript somehow always inlining every reference to ALL type declarations exported as `type`, which was exponential on complex types as `RaidenState`, messages and actions, and peaked on the `epics`, which depends on all of this.

The fix was to use empty `interface`s inheriting from the local type wherever possible, which causes TypeScript to use the `import`ed declaration instead of inlining and duplicating the whole type tree on every reference.

```typescript
export type RaidenState = t.TypeOf<typeof RaidenState>; // slow
export interface RaidenState extends t.TypeOf<typeof RaidenState> {} // fast
```

This works on all types which members are known at compile time, and should be preferred wherever possible.

## Public API

The `Raiden` client class is the entrypoint for the public API. The focus of this class is Developer Experience and we should avoid exposing too much of its internals while still providing what is needed for every reasonable use case.

This balance is important to keep in mind. It is desirable that changes in the interface are as backwards compatible as possible.

`Raiden` must have the bare minimum property list, relying on the state machine for any action performing, and being mostly responsible for translating the state machine logic to a more developer-friendly interface. That's why, instead of exposing the whole `action$` events pipeline and asking the user to interpret it, most state-changing methods actually return a `Promise`, and after dispatching the `request` action, translate the respective `success` or `fail` action to resolve or reject the returned promise.

For public interface simplicity and usability, a subset of the actions is exposed through an `events$` observable as an alternative to duplicating almost everything on explicit reimplementations using `EventEmitter`s or any other more common approach. `channels$` list is also exposed through a public observable mapped from `state$`. `state$` is publicly exposed for users willing to react to explicit state changes, although the database is required and must be persisted at all times;

Despite all of that, state machine correctness and simplicity is a priority over public API class implementation complexity. Therefore, non-state changing (aka read-only) methods may be implemented inside Raiden directly, or in pure separate utility functions when needed.

## Actions

We follow the [Flux Standard Action (`FSA`)](https://github.com/redux-utilities/flux-standard-action) pattern when creating actions. They should always be defined in the same module as the reducer which handles them.

We implemented custom functions to generate actions, with the direct advantage of using `io-ts` codecs to make them more powerful. Those functions and helpers are defined in [`src/utils/actions.ts`](https://github.com/raiden-network/light-client/blob/master/raiden-ts/src/utils/actions.ts).

- `createAction` and `createAsyncAction` provide a simple way to create typesafe and serializable actions
- `createReducer` simplifies creation of reducers which can be extended with additional actions handlers

`FSA` actions may contain data in both `payload` and `meta` properties. As FSA convention dictates that on `error=true` case payload should be the `Error` which happened, the rule of thumb is to use `meta` for any data which may be needed to uniquely identify the error action going through (e.g. `{ tokenNetwork, partner }` on channel actions). It's also recommended to be consistent on `meta` on request/success/error-related actions. All other data should go on `payload` as usual.

## Reducers

Reducers are one of the simplest parts to write. Just some heads-up:

- State must be minimal. Put in state only what's really needed to be preserved across sessions, needed to reload the account on a different system, or very expensive to re-fetch on every run. Everything else is better to go on epic dependencies or stateful observable operators and events on a per-session basis.
- As stated earlier, module/domain specific reducers should always as possible act only on actions declared on their module.
- reducers should **never** mutate state directly. Use `...` spread operator and if needed `lodash/fp` module to get mutated copies of the state you're acting on. Even when using it, be careful with object references, as you may still be mutating state through a reference to a nested object.
- Try to always be as type strict as possible. lodash's `get` and `set` usually aren't typesafe (because of their nested sweetness), so add explicit declarations and narrowing checks whenever needed, to be warned when changing anything that could break a reducer.
- Don't overthink reducers: you can always assume you're receiving a valid/consistent state and action, so no need to add too much checks besides the typing ones, just be sure to always return a valid/consistent state as well and we should be good.
- Each `action` type must be handled only once, in a single and very specific place, to avoid issues with the `reduce-reducers` pattern used in the root reducer declaration.
- The state must be JSON-serializable. Try to stay on the primitive types as much as possible, unless there's a good reason to have an instance there, and it must be serializable (with custom `io-ts` codecs, like `BigNumber`). Our custom functions to create actionCreators helps here, as it already provide explicit `io-ts` codecs.

## Epics

Epics are just functions, which receive 3 parameters: `action$`, `state$` and `deps`, and return a cold observable which, when subscribed, perform this epic's duties. These observables are subscribed in parallel. They can choose to act on any action or state change, or even dependencies, but it's important they try to follow the UNIX philosophy: do one thing, and do it well. So, as much as possible, each epic should listen a single event type, and output only the minimal action set as outcome of its specific task. The `action$` input observable should be declared as `Observable<RaidenAction>`, as every action goes through (although filtered as early as possible), but try to declare the output as specifically as possible, with a tagged union of any possible action output type.

### Hints, tips & tricks and pitfalls when developing epics

- Be careful to not complete the output observable if the system is still running, or its function will be lost, as subscriptions aren't restarted, unless it's a one-shot epic.
- On normal `redux-observable`, epics can't depend on a specific initialization or teardown order, but in order to enable clean teardown, a order is established explicitly in `src/epics.ts`: epics declared early may assume epics declared later are still alive when they're shutting down.
- Any unhandled exception (which shouldn't happen in normal operation) will cause a `raidenShutdown` action which in turn triggers completion of the inputs (`action$` and `state$`). The individual epics then have `httpTimeout` to detect this completion and gracefully complete on their own once they finish their latest async tasks/teardown. During this time some output action may still go through and change state, but this this will only be received by epics later in the subscription queue (as earlier epics should already have completed, i.e. a serial completion mechanism signaled by completion of the input observables). After this timeout, if some epic didn't complete, they're logged and then unsubscribed. Only after that the database is flushed and closed.
- Notice that catching the error in the first-level operator pipeline in an epic may prevent sdk's shutdown, but unless you're returning a long-lived/useful epic inside `catchError`, the main observable will already have completed/errored here, and whatever is above it will be noop on new/further actions; if you want to catch and handle an action, make sure to handle this action inside a `*Map` operator, and `catchError` by the end of it before returning values back to your top-level pipe.
- If an epic acts directly (like a map) on `action$`, take care to filter early on the specific action you listen to and output a different action, or else your action output will feedback on your epic and cause an infinite loop. Same if you depend on a `state$` change and your output action causes the same state change that just went through.
- A common epic pattern: `=> action$.pipe(filter(isActionOf(action)), withLatestFrom(state$), map((action, state) => ...))`
- Never subscribe explicitly inside an epic if not strictly necessary; maps and pipes help into getting a proper _action pipeline_ where a single subscription is used for all epics, making the system more deterministic, declarative and performant.
- Careful if you use `withLatestFrom` with `action$` or `state$` inside a `mergeMap`, `concatMap`, `exhaustMap`, etc, as the inner (returned) observable is created only when the outer value flows through and the callback of these operators is called. The use of `deps.latest$`, which is holding the current/latest emition of several reactive values (a `ReplaySubject(1)`), is safe in `withLatestFrom`.
- This example showcases the problem mentioed above: `withLatestFrom` only starts "seeing" values of the `input$` after it's created **and** subscribed, and will discard any source value while the `input$` didn't fire at least once, meaning it can be a silent source of bugs when used inside these mapping operators. e.g. of problematic logic:

```js
action.pipe(
  filter(...),
  mergeMap(action =>
    from(...).pipe(
      withLatestFrom(state$),
      map((_, state) => ...), // will swallow input while state$ doesn't see a new state after mergeMap call
    ),
  ),
);
```

- In the spirit of tips above, you should ALWAYS know when your (specially inner) observables are **created**, **subscribed** and **unsubscribed**.
  - On the outer/top level observable (the one returned by the epic), the creation and subscription is performed at the moment the SDK is instantiated, and unsubscription happens if the observable completes, errors or at SDK stop/shutdown.
  - `mergeMap` creates the inner observable when the a value goes through, and subscribes to it immediatelly. completing the inner observable won't complete the outer, but unhandled errors do error the outer observable.
  - `concatMap` **creates** the inner observable also at the exact moment a value goes through, but its subscription is only made when the previous observable completes. Keep an eye if the values you depended on at creation time are still valid/up-to-date at subscription time. Use `defer` if needed.
  - `exhaustMap` is like `concatMap`, but instead of queueing every output observable serially, it **ignores** the value if the previous subscription is still on, and outputs the next inner observable only on next value going through after previous observable completed.
- Obvious but it's worth to mention: if you handle external/unsafe data, use proper data validation through `io-ts`. Distrust everything!

### `Latest`/`deps.latest$`:

The `withLatestFrom` issue mentioned above caused a pattern to emerge: `connect`ing outer input values (usually mapped) to some `ReplaySubject(1)`, which were then used in inner observables which depended on having a way to fetch the latest values which may have been calculated even before the inner ones got subscribed. To avoid repeating this again and again, creating a callback-hell of nested observables and multicasted subjects, we decided to collect some of these more relevant values on a single, central subject, kept on the epics dependencies: `deps.latest$`.

This subject gets populated by a special `latestEpic`, which is the first one to receive actions/state changes notifications, and is the last one to be unsubscribed; it then maps the actions and keeps relevant values in a single object, which gets updated when any of these values change.

Example: if you need to map some action/observable and consult the reactive state, but ensure you react/test as soon as possible with the latest state, you can use `withLatestFrom(latest$.pipe(pluck('state')))` operator to get the latest state ever, but also be reactive if it changes while this inner observable is hot.

This object's interface/schema is kept in the `Latest` type. If you want to react only to changes to a specific property of this object, `pluckDistinct` custom operator integrates `pluck` and `distinctUntilChanged`.

Be careful when adding new properties to this object, as often this is something used only once, and may as well be reactively fetched from the inputs as usual; in any case though, ensure your code is always reactive and using the latest values of any property/state, instead of static references to values which may be outdated.

## Testing

The SDK tests are located at the [raiden-ts/tests](https://github.com/raiden-network/light-client/tree/master/raiden-ts/tests) subfolder. The testing framework used is [jest](http://jestjs.io), and the complete suite can be run with `yarn test` command in the SDK root folder. This will run both [unit](https://github.com/raiden-network/light-client/tree/master/raiden-ts/tests/unit) and [integration](https://github.com/raiden-network/light-client/tree/master/raiden-ts/tests/integration) tests (files ending with `.spec.ts`), and collect coverage in the `raiden/.coverage` folder. Keeping an eye on `raiden/.coverage/lcov-report/index.html` during test writting can be a good guide to writing them, although just covering the lines isn't enough, and some thought must be put into imagining possible scenarios, invariants, critical and edge states, and testing them throughout the respective tests.

### Unit tests

The unit tests try to cover as much as possible the individual functions, by testing behavior through expected and unexpected inputs, and their respective outputs. For that, we use extensively [jest mocks](https://jestjs.io/docs/en/mock-functions) to contextually replace external and internal dependencies of each tested function, and force the external logic to behave on the different (possible, conceivable) ways and ensure that our tested logic handles all of them.

We try to split unit tests by kind of tested function. Most of the tested functions are pure (like `utils`, or `reducers`). To add a new test, simply add the `describe` and `test` calls to the respective function type.

### Integration tests

The integration tests combine multiple units of the SDK and test if they work together as intended by their interface definitions. In the center of these tests are the epics which implement the Raiden protocol. They are the natural hub of the SDK where all units come together. Here the units dealing with the blockchain come together with units handling message on the transport layer.
These test must not use any external end but rather to continue using mocks and stubs where needed while continuously remove mocks for 1st party units.

The hardest to unit test are the epics. As they conceive most of the Raiden logic, are async and may depend on multiple parts working together (e.g. an output action changing input state). In the past we called epics directly, but the setup turned out to be to cumbersome to use. Therefore now the tests set up the whole state machine and subscribe to all epics at once. Inputs and requests are injected in the store, and outputs are collected in an output array per client. This new pattern has shown to be orders of magnitude easier to write and more correct to set up, while as fast. Individual utils and helpers are still unit-tested independently whenever possible.

### E2E tests

The end-to-end tests check the SDK without any mocking by running it on a development network and with actual synapse matrix servers. This setup runs in a container, with the configuration being available in the [`e2e-environment` directory](https://github.com/raiden-network/light-client/blob/master/e2e-environment).

The key of these end-to-end tests is to find a good balance. The most important and extensive end-to-end tests are run by the [Scenario Player](https://github.com/raiden-network/scenario-player) on a nightly time shift. These test runs take very long, use a real blockchain with a real deployed Raiden Service Bundle. Furthermore they run on a special server cluster.
Therefore it is the purpose of the end-to-end tests here to provide a more light-weight and fast complementation. The requirements are that they can run in an independent environment on any developers local PC, as well as within a continuous integration environment to verify pull requests. And they need to run fast enough so they do not hinder developers daily workflow (i.e. in maximum a couple of minutes).
The goal of these tests is to increase the trust in changes by a pull request and decreasing the stress of developers (and reviewers). The tests should be just as good as it is necessary to catch mistakes early and before the nightlies must fail. The nightly tests by the Scenario player should fail rarely by changes introduced of a recent pull request. Merging a pull request to the `master` branch should be quite safe without the need of frequent follow-up PRs on the next day to fix the errors that got introduced, but discovered too late by the Scenario Player.

The end-to-end tests are defined in [e2e.spec.ts](https://github.com/raiden-network/light-client/blob/master/raiden-ts/tests/e2e/e2e.spec.ts). They only test the API of the [`Raiden`](https://github.com/raiden-network/light-client/blob/master/raiden-ts/src/raiden.ts) object.

## Debugging

The SDK being a TypeScript/JavaScript library, debugging it can use a lot of the standard webapp/browser/node tools and interfaces.

### Browser/live session:

1. Build the SDK: on `root` folder, run `yarn workspace raiden-ts build`
2. Run the dApp on development mode: on the `root` folder, run `yarn workspace raiden-dapp serve`
3. On a browser, go to the local dApp instance, usually http://localhost:8080
4. Open Dev Tools (usually, shortcut `Ctrl+Shift+I`). You can already see the `redux-logger` output in `Console` tab, which can be very useful to see the live actions going through the Redux state machine, as you navigate through the dApp.
5. Install Vue DevTools for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/) or [Chrome](https://chrome.google.com/webstore/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd): now, you can go to the `Vue` tab, click on the `app` component (which will be bound to the console's `$vm0` var), and access the SDK instance from with `raiden = $vm0.$raiden.raiden`. Now, the variable `raiden` is the SDK instance, and one can use it to access and call properties and methods from the API. `await` or `.then()` can be useful when dealing with the `async` methods.
6. State can be inspected from the app's `indexedDB`, in the `Storage` or `Application` tabs.
7. While most epics variables and dependencies aren't persisted in the Raiden instance, but only used contextually in its epic, one can log them in any step and access it by right-clicking in the logged out object. If the need arises, the [RaidenEpicDeps](https://github.com/raiden-network/light-client/blob/84afc0939d267e99636147e8241d7bda4f55cbb1/raiden/src/types.ts#L32) object can be saved in a `Raiden` property in the constructor and acessed from the console as well, giving full access to the instance details and variables.
8. Looking at the in-browser sourcecode can be tricky, as even with proper maps, it'll be the `webpack`ed version of the `tsc`ed sourcecode. Comparing the sources in `webpack-internal` to the actual `.ts` sourcecode can give good hints on what's failing.
9. The Redux store can be visualized and even be modified with the Redux DevTools Extension. Install it for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/reduxdevtools/) or [Chrome](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd) and go to the `Redux` tab in your Dev Tools.

### With tests

Debugging unit tests is way easier and usually more efficient, as one can properly pick source code lines, pause and jump on exact conditions, and inspect execution directly with tools like chrome-inspector.
Refer to [jest docs](https://jestjs.io/docs/en/troubleshooting) to debug on testing.
