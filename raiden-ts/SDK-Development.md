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
  Architecture **description**, code style and patterns, tips & tricks, caveats, typing and pits to avoid!
</h4>

The Raiden Light Client SDK requires a Web3 provide like [MetaMask](https://metamask.io), [Parity](https://www.parity.io) or [Geth](https://geth.ethereum.org) and is built on the following concepts and libraries:
* Functional programming
* [Redux](https://redux.js.org) architecture
* Strictly typed data models aided by [io-ts](https://github.com/gcanti/io-ts)
* [RxJS](https://rxjs.dev/) Observables asynchronous tasks through [redux-observable](https://redux-observable.js.org) Epics
* Off-chain communication through [Matrix](https://matrix.org) servers using the [matrix-js-sdk](https://github.com/matrix-org/matrix-js-sdk) library

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
In this section we will dive into the the internal machinery of the SDK and outline how RxJS, Redux and Epics work together. The architecture is divided in a:

[Vertical Stack](#vertical-stack)  
[Horizontal (Folder Structure)](#horizontal-folder-structure)

### Vertical (Stack)
Instead of using classes as in object-oriented programming the SDK is written in a functional way and uses functions and type schemas like interfaces to separate logic and data.

The only class in the SDK is the [Raiden](https://github.com/raiden-network/light-client/blob/e3ffb1b24e25ffca1c072a9335b00d47bc148d81/raiden/src/raiden.ts#L66) class which is the main entry point. It is instantiated through the [`async Raiden.create`](https://github.com/raiden-network/light-client/blob/e3ffb1b24e25ffca1c072a9335b00d47bc148d81/raiden/src/raiden.ts#L231) static method. This method returns a ready-to-use `Raiden` client object which instantiates and starts a central Redux `store`.

The Redux `store` is responsible for handling the **actions** that changes the **state** of the **reducers**. The **reducers** are in turn calling the functions which changes the state of your application.

All **actions** goes to the **Epics** middleware where synchronous and asynchronous tasks can be performed with the help of **observables**. Any new action that is outputted gets fed back to the Redux store and continues down this *actions pipeline*.

The `Raiden` client dispatches [**request**] actions to the `store` and waits for a respective **success** or **error** to flow through the actions pipeline. These actions are created using [typesafe-actions](https://github.com/piotrwitek/typesafe-actions) with the [Flux Standard Action](https://github.com/redux-utilities/flux-standard-action) schema/pattern.

All the business logic happens in the `Epics`, they accept a dependencies object as a third parameter. This acts as a dependency injector (DI) and contains everything from configuration variables to the Ethers `Provider` instance. The `Epics` are factories that receives the `actions$` and `state$` observables and dependencies and outputs observables of new actions. They can listen and react to any kind of event or observable.

The Blockchain interaction happens through [ethers](https://github.com/ethers-io/ethers.js). [TypeChain](https://github.com/ethereum-ts/TypeChain) runs at build time and generates type declarations for the contracts. Both `Ethers` and `TypeChain` are available as dependencies at construction time.

Matrix interaction is done through `matrix-js-sdk`, but as it needs more complex async initialization (password signing, syncing, etc), it goes as a init-time epic and is made available through a `matrix$: AsyncSubject` dependency.

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
                            |  Ξ ethers  |   |  matrix.org  |
                            |            |   |              |
                            +------------+   +--------------+
```




### Horizontal (Folder Structure)
The project is structures in a domain-driven logic, each folder under `src` represents a semantic domain and should depend on the things inside of it as much as possible. Especially for _actions_*_, _reducers_, _epics_, _state_ and specific *functions*.

* [`abi`](https://github.com/raiden-network/light-client/tree/master/raiden/src/abi) and [`deployment`](https://github.com/raiden-network/light-client/tree/master/raiden/src/deployment) are data directories and don't contain any logic.
  * `abi` is the output of the [TypeChain](https://github.com/ethereum-ts/TypeChain) contracts interfaces used for type safety.
  * `deployment` contains information about the deployed Raiden contracts for the Ethereum test networks.
* [`utils`](https://github.com/raiden-network/light-client/tree/master/raiden/src/utils) are common functions and types for the whole Light Client. The code here should not depend on any other SDK modules but can depend on external libraries.
* [`store`](https://github.com/raiden-network/light-client/tree/master/raiden/src/store) is the actions, epics and utils used by the Raiden store/state and initialization/shutdown. This is "light code" that do not fit well within other domains.
* [`channels`](https://github.com/raiden-network/light-client/tree/master/raiden/src/channels) is the contracts logic for the blockchain and channel manager. This is mostly code for listening to events and perform blockchain actions like opening a channel, detecting a deposit or informing that a closed channel is settleable.
* [`transport`](https://github.com/raiden-network/light-client/tree/master/raiden/src/transport) is for the off-chain transport/communication. It is mainly matrix code, like login and initialization logic, room creation, invite and maintenance tasks as well as the actually sending and receiving of text messages between Raiden nodes.
* [`messages`](https://github.com/raiden-network/light-client/tree/master/raiden/src/transport) are the messages data models and validation and serialization/deserialization utils.
* [`transfer`](https://github.com/raiden-network/light-client/tree/master/raiden/src/transfers) is the transfers logic, life cycle and validation.
* [`./src`](https://github.com/raiden-network/light-client/tree/master/raiden/src) contains the `Raiden` client and public API, root, Epic, Reducer, Action, specific types, constants etc. Anything that should be _global_.

These are just suggestions on how to keep a well organized codebase. It is the developer's responsibility to decide in which module/domain any function, data or type belongs.

## Typing System
TypeScript helps us check for correctness and aid implementation, validation and integration of various parts of the codebase. We can tell TypeScript what type of argument, return value or variable is expected in a function which helps us avoid passing wrong types when writing our code, like passing a number to a function that expects a string.

However, when we are dealing with unknown data we cannot always be sure it matches our expectations. To bridge this gap we use the `io-ts` library.

`io-ts` solves this by allowing you to create **codecs**: real runtime objects which are able to verify the expectations (e.g. type) of any data, validating it and type guarding your code. They're also able to decode data from some (usually a more primitive) input type to the expected runtime instance/value, as well as encode a value to a given output format. Better yet, each codec have an associated compile-time **type**, to tell TypeScript what the output data of a codec looks like, allowing TypeScript to do its magic without needing to declare twice your data structure (one for runtime validation, other for compile-time type checks).
Finally, codecs can be composed in almost any way supported by TypeScript, making it very powerful. Example:
```typescript
import * as t from 'io-ts';
const Data = t.type({ key: t.number }); // this is the codec, a real object
type Data = t.TypeOf<typeof Data>; // this is the type for the above codec, actually: { key: number; }
const mydata = JSON.parse('{ "key": 123 }'); // mydata type is any
const decoded = Data.decode(mydata); // decoded is Either an error (left) or the expected value (right)
if (decoded.isLeft()) throw decoded.value;
// from now on, decoded.value is known to be of type Data, thus mydata.key is number
const sq: number = Math.pow(decoded.value.key, 2)
```

We can use it to have validate strong guarantees about unsafe data, can define our own codecs to serialize and deserialize custom objects, and as typeguards to narrow broader types to more specific ones.

### Branded types

TypeScript branded types (aka. poor man's nominal typing) helps developers provide hints/refinements about specific types which can be compared to full inheritance systems in OOP paradigms. It consists basically of making a branded type TB as the intersection of base type A with some brand B, which makes the branded type more specific. So, `type TB = number & { brand }` is equivalent in OO of making an inherited/child class `TB` extending `number`. You can still pass `TB` where `number` is expected (and it's a child of number), but you can't pass a simple `number` where `TB` is expected unless you type-cast it.

On TypeScript, all this normally happens only at compile-time (the brand usually is just an interface with a `unique symbol`), having no impact at runtime, when the variable would effectivelly be a simple `number`. `io-ts` allows us to have codecs which also validates if a parent type matches the expectations to be considered a branded/child type, allowing us to also have specific type safety beyond just validating some data is a `string` or not.

For example, in our [types](https://github.com/raiden-network/light-client/tree/master/raiden/src/utils/types.ts), we declare the type `Address`, which is (actually) a `string`, which happens to be validated to also be a `HexString` of size `20 bytes`, and which also happens to be in the checksummed format, without ceasing to be a `string`!

We try to make all the types we use as strict as needed, specially considering externally-originated data, like messages, as the security of the system may depend on doing the right thing, always. With proper TypeScript usage and tools (like `io-ts` and `typesafe-actions`), we should always be able to narrow down the data type we're using in any part of the code. Avoid acting on `any`-typed data, much less declaring it as so. Literals and tagged unions help a lot to keep narrow/strict types whenever needed, with `if`, `throw`, `typeof` and even explicit typeguard functions. This way, we'll get the compiler to help development and enforce correctness.

### A note about `io-ts` and type complexity

While developing our more complex types, we noticed a significant slowdown on TypeScript transpilation time (taking up to 5min), which also heavily affected `tsserver` for Intellisense, auto-completion, type validation, and also expressed itself as `.d.ts` declaration files of tens of MBs in size.

Further investigation have shown that this was caused by TypeScript somehow always inlining every reference to ALL type declarations exported as `type`, which was exponential on complex types as `RaidenState`, messages and actions, and peaked on the `epics`, which depends on all of this.

The fix was to use empty `interface`s inheriting from the local type wherever possible, which causes TypeScript to use the `import`ed declaration instead of inlining and duplicating the whole type tree on every reference.

```typescript
export type RaidenState = t.TypeOf<typeof RaidenState>; // slow
export interface RaidenState extends t.TypeOf<typeof RaidenState> {}; // fast
```
This works on all types which members are known at compile time, and should be preferred wherever possible.

## Public API
The `Raiden` client class is the entrypoint for the public API. The focus of this class is Developer Experience and we should avoid exposing to much of its internals while still providing what is needed for every reasonable use case.

This balance is important to keep in mind. It is desirable that changes in the interface are as backwards compatible as possible, although not necessarily before a MVP release.

`Raiden` must have the bare minimum property list, relying on the state machine for any action performing, and being mostly responsible for translating the state machine logic to a more developer-friendly interface. That's why, instead of exposing the whole `action$` events pipeline and asking the user to interpret it, most state-changing methods actually return a `Promise`, and after dispatching the `request` action, translate the respective `success` or `fail` action to resolve or reject the returned promise. Just for public interface simplicity and usability, a subset of the actions is exposed through an `events$` observable as an alternative to duplicating almost everything on explicit reimplementations using `EventEmitter`s or any other more common approach. `channels$` list is also exposed through a public observable mapped from `state$`. `state$` is publicly exposed only so users willing to pass an `initial state` and manage the state persistency themselves (instead of the recommended `localStorage` approach) can do so by listening on state changes on this observable, but value's format must not be relied on and considered implementation detail and subject to change.

Despite all of that, state machine correctness and simplicity is a priority over public API class implementation complexity. Therefore, non-state changing (aka read-only) method may be implemented inside Raiden directly, or in pure separate utility functions when needed.

## Actions

We follow the [Flux Standard Action (`FSA`)](https://github.com/redux-utilities/flux-standard-action) pattern when creating actions. They should always sit on the same module as the reducer which handles them. The usual redux approach requires creating/changing up to 4 places to create a new action: an `enum` of action types, a `interface` for the action object, a `factory function` and a `tagged union` of actions, to have proper reducer type safety.

The `typesafe-actions` help a lot with that by allowing us to define a new action in a single place: defining an `action-creator` object. For FSA schema, we use [`createStandardAction`](https://github.com/piotrwitek/typesafe-actions#2-fsa-compliant-actions) helper. It'll create an object in the module's action submodule, and this action-creator both acts directly as action factory, and contain all metadata needed for the actions: `getType(action)` gives the `string literal` used as `type` tag for the action (allowing to easily narrow type on `switch (action.type)` statements), `ActionType<typeof action>` is used to get the interface/type/schema for the action, and `ActionType<typeof Actions>` also allows to use `import * as Actions` mappings to get a tagged union of all exported actions in a module.

`FSA` actions may contain data in both `payload` and `meta` properties. As FSA convention dictates that on `error=true` case payload should be the `Error` which happened, the rule of thumb is to use `meta` for any data which may be needed to filter the error action going through (e.g. `{ tokenNetwork, partner }` on channel actions). It's also recommended to be consistent on `meta` on request/success/error`-related actions. All other data should go on `payload` as usual.

## Reducers

Reducers are one of the simplest parts to write. Just some heads-up:
- State must be minimal. Put in state only what's really needed to be preserved across sessions, needed to reload the account on a different system, or very expensive to re-fetch on every run. Everything else is better to go on epic dependencies or stateful observable operators and events on a per-session basis.
- As stated earlier, module/domain specific reducers should always as possible act only on actions declared on their module.
- reducers should **never** mutate state directly. Use `...` spread operator and if needed `lodash/fp` module to get mutated copies of the state you're acting on. Even when using it, be careful with object references, as you may still be mutating state through a reference to a nested object.
- Try to always be as type strict as possible. lodash's `get` and `set` usually aren't typesafe (because of their nested sweetness), so add explicit declarations and narrowing checks whenver needed, to be warned when changing anything that could break a reducer.
- Don't overthink reducers: you can always assume you're receiving a valid/consistent state and action, so no need to add too much checks besides the typing ones, just be sure to always return a valid/consistent state as well and we should be good.
- Each `action` type must be handled only once, in a single and very specific place, to avoid issues with the `reduce-reducers` pattern used in the root reducer declaration.
- The state must be JSON-serializable. Try to stay on the primitive types as much as possible, unless there's a good reason to have an instance there, and it must be serializable (with custom `io-ts` codecs, like `BigNumber`s).

## Epics

Epics can choose to act on any action or state change, or even dependencies, but it's important they try to follow the UNIX philosophy: do one thing, and do it well. So, as much as possible, each epic should listen a single event type, and output only the minimal action set as outcome of its specific task. The `action$` input observable should be declared as `Observable<RaidenAction>`, as every action goes through (although filtered as early as possible), but try to declare the output as specifically as possible, with a tagged union of any possible action output type.

### Hints, tips & tricks and pits to keep an eye on developing epics:

- Be careful to not complete the output observable if the system is still running, or its function will be lost, as subscriptions aren't restarted.
- Any unhandled exception will cause a `raidenShutdown` action with the exception to go through as last action, all epics being unsubscribed, action$ and state$ completing and the whole system to shutdown. Handle any expected exception and output a respective `fail` action if relevant, or logging it and swallowing it with `EMPTY` or `ignoreElements`. Unhandled exceptions shouldn't happen in normal operation.
- If an epic acts directly (like a map) on `action$`, take care to filter early on the specific action you listen to and output a different action, or else your action output will feedback on your epic and cause an infinite loop. Same if you depend on a `state$` change and your output action causes the same state change that just went through.
- A common epic pattern: `=> action$.pipe(filter(isActionOf(action)), withLatestFrom(state$), map((action, state) => ...))`
- Never subscribe inside an epic if not strictly necessary; maps and pipes help into getting a proper _action pipeline_ where a single subscription is used for all epics, making the system more deterministic, declarative and performant.
- Careful if you use `withLatestFrom` with `action$` or `state$` inside a `mergeMap`, `concatMap`, `exhaustMap`, etc, as the inner (returned) observable is created only when the outer value flows through and the callback of these operators is called. `withLatestFrom` only starts "seeing" values of the input$ after it's created **and** subscribed, and will discard any source value while the input$ didn't fire at least once, meaning it can be a silent source of bugs when used inside these mapping operators. e.g. of problematic logic:
```
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
- In the case above, one can use `multicast` + `ReplaySubject(1)` to create an outer subject which sees and cache latest state, and use safely as much *Map levels down as needed. Another approach (in some cases) is to return the inner observable from the mergeMap as soon as possible to the outer pipeline, and then on the **outer** pipeline use withLatestMap and any subsequent mappings.
- In the spirit of tips above, you should ALWAYS know when your (specially inner) observables are **created**, **subscribed** and **unsubscribed**.
  * On the outer/top level observable (the one returned by the epic), the creation and subscription is performed at the moment the SDK is instantiated, and unsubscription happens if the observable completes, errors or at SDK stop/shutdown.
  * `mergeMap` creates the inner observable when the a value goes through, and subscribes to it immediatelly. completing the inner observable won't complete the outer, but unhandled errors do error the outer observable.
  * `concatMap` creates the inner observable also at the exact moment a value goes through, but its subscription is only made when the previous observable completes. Keep an eye if the values you depended on at creation time are still valid/up-to-date at subscription time. Use multicasts if needed.
  * `exhaustMap` is like `concatMap`, but instead of queueing every output observable serially, it **ignores** the value if the previous subscription is still on, and outputs the next inner observable only on next value going through after previous observable completed.
- Obvious but it's worth to mention: if you handle external/unsafe data, use proper data validation through `io-ts`. Distrust everyone!

## Testing

The SDK tests are located at the [raiden/tests](https://github.com/raiden-network/light-client/tree/master/raiden/tests) subfolder. The testing framework used is [jest](http://jestjs.io), and the complete suite can be run with `pnpm test` command in the SDK root folder. This will run both [unit](https://github.com/raiden-network/light-client/tree/master/raiden/tests/unit) and [e2e](https://github.com/raiden-network/light-client/tree/master/raiden/tests/e2e) tests (files ending with `.spec.ts`), and collect coverage in the `raiden/.coverage` folder. Keeping an eye on `raiden/.coverage/lcov-report/index.html` during test writting can be a good guide to writing them, although just covering the lines aren't enough, and some thought must be put into imagining possible scenarios, invariants, critical and edge states, and testing them throughout the respective tests.

### Unit tests

The unit tests try to cover as much as possible the individual functions, by testing behavior through expected and unexpected inputs, and their respective outputs. For that, we use extensively [jest mocks](https://jestjs.io/docs/en/mock-functions) to contextually replace external and internal dependencies of each tested function, and force the external logic to behave on the different (possible, conceivable) ways and ensure the our tested logic handles all of them. Most of the unit mocks are in [raiden/tests/unit/mocks.ts](https://github.com/raiden-network/light-client/blob/master/raiden/tests/unit/mocks.ts), but some others are needed to be put in the beginning of the respective test files, for the mocking to take place before importing code using the mocked logic.

We try to split unit tests by kind of tested function. Most of the tested functions are pure (like `utils`, or `reducers`) or have very explicit dependencies (`epics`). To add a new test, simply add the `describe` and `test` calls to the respective function type.

The hardest to unit test are the epics. As they conceive most of the Raiden logic, are async and may depend on multiple parts working together (e.g. an output action changing input state), up to now we don't have a standardized way of writting their tests, although as we look to writting them in the most isolated way possible and each having a single codepath (rxjs operators pipeline) helps into wrapping and setting up all required testing context to get maximum coverage and ensuring the different scenarios are properly handled. `Observable.toPromise()` and [rxjs-marbles](https://cartant.github.io/rxjs-marbles/) can help into inspecting the outputs.

### e2e tests

e2e tests try to test the SDK as well as the dependency stack from the [public API](https://github.com/raiden-network/light-client/blob/master/raiden/src/raiden.ts) perspective, by performing proper actions as a user would do. Adding tests here basically involve adding them to [raiden.spec.ts](https://github.com/raiden-network/light-client/blob/master/raiden/tests/e2e/raiden.spec.ts), with required Matrix endpoints and state.

We don't have proper integration tests (yet) because Raiden Light Client depends heavily on some external systems to work, namely the [Raiden Network](https://raiden.network) through its network of full [Python clients](https://github.com/raiden-network/raiden), [Matrix servers](https://github.com/raiden-network/raiden-transport), Ethereum node and so on. This would be a rather heavy stack to provide whole, requiring different environments, languages, dependencies to run and set everything in the proper state on each test.

To try to provide e2e tests as complete as possible, we move the mocks to the edges, and there answer as we expect these systems to:
- Ethereum node is handled by [ganache-cli](https://github.com/raiden-network/light-client/blob/84afc0939d267e99636147e8241d7bda4f55cbb1/raiden/tests/e2e/provider.ts#L20), which is a complete EVM emulation layer.
- Matrix is handled by [replacing only the HTTP requests](https://github.com/raiden-network/light-client/blob/84afc0939d267e99636147e8241d7bda4f55cbb1/raiden/tests/e2e/mocks.ts#L23) as per [matrix.org client-server spec](https://matrix.org/docs/spec/client_server/latest). Of course this isn't perfect, but have provided good enough results so far.
- We don't have the e2e tests which depends on the Raiden full nodes (mainly testing the [Raiden.transfer](https://github.com/raiden-network/light-client/blob/84afc0939d267e99636147e8241d7bda4f55cbb1/raiden/src/raiden.ts#L660) action), but it'll probably involve adding some checks and expected replies to the above Matrix HTTP mocks

We expect to put more effort on integration and compliance tests in the future, potentially language agnostic ones which could be shared between clients, and expanded as the SDK feature set grows to support other roles beyond payment sender.

## Debugging

The SDK being a TypeScript/JavaScript library, debugging it can use a lot of the standard webapp/browser/node tools and interfaces.

### Browser/live session:

1. Build the SDK: on `root` folder, run `pnpm run build --filter raiden-ts`
2. Run the dApp on development mode: on the `root` folder, run `pnpm run serve --filter raiden-dapp`
3. On a browser, go to the local dApp instance, usually http://localhost:8080
4. Open Dev Tools (usually, shortcut `Ctrl+Shift+I`). You can already see the `redux-logger` output in `Console` tab, which can be very useful to see the live actions going through the Redux state machine, as you navigate through the dApp.
5. Install Vue DevTools for [Firefox](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/) or [Chrome](https://chrome.google.com/webstore/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd): now, you can go to the `Vue` tab, click on the `app` component (which will be bound to the console's `vm0` var), and access the SDK instance from with `raiden = $vm0.$raiden.raiden`. Now, the variable `raiden` is the SDK instance, and one can use it to access and call properties and methods from the API. `await` or `.then()` can be useful when dealing with the `async` methods.
6. State can be inspected and even edited as a JSON (while the SDK is **not** running) from the app's `localStorage`, in the `Storage` or `Application` tabs.
7. While most epics variables and dependencies aren't persisted in the Raiden instance, but only used contextually in its epic, one can log them in any step and access it by right-clicking in the logged out object. If the need arises, the [RaidenEpicDeps](https://github.com/raiden-network/light-client/blob/84afc0939d267e99636147e8241d7bda4f55cbb1/raiden/src/types.ts#L32) object can be saved in a `Raiden` property in the constructor and acessed from the console as well, giving full access to the instance details and variables.
8. Looking at the in-browser sourcecode can be tricky, as even with proper maps, it'll be the `webpack`ed version of the `tsc`ed sourcecode. Comparing the sources in `webpack-internal` to the actual `.ts` sourcecode can give good hints on what's failing.

### With tests

Debugging unit tests is way easier and usually more efficient, as one can properly pick source code lines, pause and jump on exact conditions, and inspect execution directly with tools like chrome-inspector.
Refer to [jest docs](https://jestjs.io/docs/en/troubleshooting) to debug on testing.
