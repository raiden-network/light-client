import { Signer } from 'ethers';
import { Wallet } from 'ethers/wallet';
import { AsyncSendable, Web3Provider, JsonRpcProvider } from 'ethers/providers';
import { Network, BigNumber, BigNumberish } from 'ethers/utils';

import { MatrixClient } from 'matrix-js-sdk';
import { Middleware, applyMiddleware, createStore, Store } from 'redux';
import { createEpicMiddleware, EpicMiddleware } from 'redux-observable';
import { isActionOf } from 'typesafe-actions';
import { createLogger } from 'redux-logger';

import {
  debounce,
  findKey,
  transform,
  constant,
  memoize,
  pick,
  isEmpty,
  merge as _merge,
} from 'lodash';
import {
  Observable,
  Subject,
  BehaviorSubject,
  AsyncSubject,
  from,
  merge,
  defer,
  EMPTY,
} from 'rxjs';
import {
  first,
  filter,
  map,
  distinctUntilChanged,
  scan,
  concatMap,
  mergeMap,
  pluck,
} from 'rxjs/operators';

import './polyfills';
import { TokenNetworkRegistryFactory } from './contracts/TokenNetworkRegistryFactory';
import { TokenNetworkFactory } from './contracts/TokenNetworkFactory';
import { HumanStandardTokenFactory } from './contracts/HumanStandardTokenFactory';
import { ServiceRegistryFactory } from './contracts/ServiceRegistryFactory';

import ropstenDeploy from './deployment/deployment_ropsten.json';
import rinkebyDeploy from './deployment/deployment_rinkeby.json';
import kovanDeploy from './deployment/deployment_kovan.json';
import goerliDeploy from './deployment/deployment_goerli.json';
import ropstenServicesDeploy from './deployment/deployment_services_ropsten.json';
import rinkebyServicesDeploy from './deployment/deployment_services_rinkeby.json';
import kovanServicesDeploy from './deployment/deployment_services_kovan.json';
import goerliServicesDeploy from './deployment/deployment_services_goerli.json';

import { ContractsInfo, RaidenEpicDeps } from './types';
import { ShutdownReason } from './constants';
import { RaidenState, makeInitialState, encodeRaidenState, decodeRaidenState } from './state';
import { RaidenConfig } from './config';
import { RaidenChannels } from './channels/state';
import { channelAmounts } from './channels/utils';
import { SentTransfer, SentTransfers, RaidenSentTransfer } from './transfers/state';
import { raidenReducer } from './reducer';
import { raidenRootEpic } from './epics';
import {
  RaidenAction,
  RaidenEvents,
  RaidenEvent,
  raidenShutdown,
  raidenConfigUpdate,
} from './actions';
import {
  channelOpened,
  channelOpenFailed,
  channelOpen,
  channelDeposited,
  channelDepositFailed,
  channelDeposit,
  channelClosed,
  channelCloseFailed,
  channelClose,
  channelSettled,
  channelSettleFailed,
  channelSettle,
} from './channels/actions';
import {
  matrixPresenceUpdate,
  matrixRequestMonitorPresenceFailed,
  matrixRequestMonitorPresence,
} from './transport/actions';
import { transfer, transferFailed, transferSigned } from './transfers/actions';
import { makeSecret, raidenSentTransfer, getSecrethash, makePaymentId } from './transfers/utils';
import { pathFind, pathFound, pathFindFailed } from './path/actions';
import { Paths, RaidenPaths } from './path/types';
import { Address, PrivateKey, Secret, Storage, Hash, UInt, decode } from './utils/types';
import { patchSignSend } from './utils/ethers';
import { losslessParse } from './utils/data';

export class Raiden {
  private readonly store: Store<RaidenState, RaidenAction>;
  private readonly deps: RaidenEpicDeps;

  /**
   * action$ exposes the internal events pipeline. It's intended for debugging, and its interface
   * must not be relied on, as its actions interfaces and structures can change without warning.
   */
  public readonly action$: Observable<RaidenAction>;
  /**
   * state$ is exposed only so user can listen to state changes and persist them somewhere else,
   * in case they didn't use the Storage overload for the storageOrState argument of `create`.
   * Format/content of the emitted objects are subject to changes and not part of the public API
   */
  public readonly state$: Observable<RaidenState>;
  /**
   * channels$ is public interface, exposing a view of the currently known channels
   * Its format is expected to be kept backwards-compatible, and may be relied on
   */
  public readonly channels$: Observable<RaidenChannels>;
  /**
   * A subset ot RaidenActions exposed as public events.
   * The interface of the objects emitted by this Observable are expected not to change internally,
   * but more/new events may be added over time.
   */
  public readonly events$: Observable<RaidenEvent>;

  /**
   * Observable of completed and pending transfers
   * Every time a transfer state is updated, it's emitted here. 'secrethash' property is unique and
   * may be used as identifier to know which transfer got updated.
   */
  public readonly transfers$: Observable<RaidenSentTransfer>;

  /**
   * Expose ether's Provider.resolveName for ENS support
   */
  public readonly resolveName: (name: string) => Promise<Address>;

  /**
   * Get constant token details from token contract, caches it.
   * Rejects only if 'token' contract doesn't define totalSupply and decimals methods.
   * name and symbol may be undefined, as they aren't actually part of ERC20 standard, although
   * very common and defined on most token contracts.
   *
   * @param token - address to fetch info from
   * @returns token info
   */
  public getTokenInfo: (
    token: string,
  ) => Promise<{
    totalSupply: BigNumber;
    decimals: number;
    name?: string;
    symbol?: string;
  }>;

  private epicMiddleware?: EpicMiddleware<
    RaidenAction,
    RaidenAction,
    RaidenState,
    RaidenEpicDeps
  > | null;

  public constructor(
    provider: JsonRpcProvider,
    network: Network,
    signer: Signer,
    contractsInfo: ContractsInfo,
    state: RaidenState,
  ) {
    this.resolveName = provider.resolveName.bind(provider) as (name: string) => Promise<Address>;
    const address = state.address;

    // use next from latest known blockNumber as start block when polling
    provider.resetEventsBlock(state.blockNumber + 1);

    const state$ = new BehaviorSubject<RaidenState>(state);
    this.state$ = state$;

    const action$ = new Subject<RaidenAction>();
    this.action$ = action$;

    this.channels$ = state$.pipe(
      map(state =>
        transform(
          // transform state.channels to token-partner-raidenChannel map
          state.channels,
          (result, partner2channel, tokenNetwork) => {
            const token = findKey(state.tokens, tn => tn === tokenNetwork) as Address | undefined;
            if (!token) return; // shouldn't happen, token mapping is always bi-directional
            result[token] = transform(
              // transform Channel to RaidenChannel, with more info
              partner2channel,
              (partner2raidenChannel, channel, partner) => {
                const {
                  ownDeposit,
                  partnerDeposit,
                  ownBalance: balance,
                  ownCapacity: capacity,
                } = channelAmounts(channel);

                partner2raidenChannel[partner] = {
                  state: channel.state,
                  ...pick(channel, ['id', 'settleTimeout', 'openBlock', 'closeBlock']),
                  token,
                  tokenNetwork: tokenNetwork as Address,
                  partner: partner as Address,
                  ownDeposit,
                  partnerDeposit,
                  balance,
                  capacity,
                };
              },
            );
          },
        ),
      ),
    );

    this.transfers$ = state$.pipe(
      pluck('sent'),
      distinctUntilChanged(),
      concatMap(sent => from(Object.entries(sent))),
      /* this scan stores a reference to each [key,value] in 'acc', and emit as 'changed' iff it
       * changes from last time seen. It relies on value references changing only if needed */
      scan<[string, SentTransfer], { acc: SentTransfers; changed?: SentTransfer }>(
        ({ acc }, [secrethash, sent]) =>
          // if ref didn't change, emit previous accumulator, without 'changed' value
          acc[secrethash] === sent
            ? { acc }
            : // else, update ref in 'acc' and emit value in 'changed' prop
              { acc: { ...acc, [secrethash]: sent }, changed: sent },
        { acc: {} },
      ),
      filter(({ changed }) => !!changed), // filter out if reference didn't change from last emit
      map(({ changed }) => changed!), // get the changed object only
      // from here, we get SentTransfer objects which changed from previous state (all on first)
      map(raidenSentTransfer),
    );

    this.events$ = action$.pipe(filter(isActionOf(Object.values(RaidenEvents))));

    this.getTokenInfo = memoize(async (token: string) => {
      if (!Address.is(token)) throw new Error('Invalid address');
      if (!(token in this.state.tokens)) throw new Error(`token "${token}" not monitored`);
      const tokenContract = this.deps.getTokenContract(token);
      const [totalSupply, decimals, name, symbol] = await Promise.all([
        tokenContract.functions.totalSupply(),
        tokenContract.functions.decimals(),
        tokenContract.functions.name().catch(constant(undefined)),
        tokenContract.functions.symbol().catch(constant(undefined)),
      ]);
      return { totalSupply, decimals, name, symbol };
    });

    const middlewares: Middleware[] = [
      createLogger({
        level: () =>
          this.deps.config$.value.logger !== undefined
            ? this.deps.config$.value.logger
            : process.env.NODE_ENV === 'development'
            ? 'debug'
            : '',
      }),
    ];

    this.deps = {
      stateOutput$: state$,
      actionOutput$: action$,
      config$: new BehaviorSubject<RaidenConfig>(state.config),
      matrix$: new AsyncSubject<MatrixClient>(),
      provider,
      network,
      signer,
      address,
      contractsInfo,
      registryContract: TokenNetworkRegistryFactory.connect(
        contractsInfo.TokenNetworkRegistry.address,
        signer,
      ),
      getTokenNetworkContract: memoize((address: Address) =>
        TokenNetworkFactory.connect(address, signer),
      ),
      getTokenContract: memoize((address: Address) =>
        HumanStandardTokenFactory.connect(address, signer),
      ),
      serviceRegistryContract: ServiceRegistryFactory.connect(
        contractsInfo.ServiceRegistry.address,
        signer,
      ),
    };
    // minimum blockNumber of contracts deployment as start scan block
    this.epicMiddleware = createEpicMiddleware<
      RaidenAction,
      RaidenAction,
      RaidenState,
      RaidenEpicDeps
    >({ dependencies: this.deps });

    this.store = createStore(
      raidenReducer,
      state,
      applyMiddleware(...middlewares, this.epicMiddleware),
    );
  }

  /**
   * Async helper factory to make a Raiden instance from more common parameters.
   *
   * An async factory is needed so we can do the needed async requests to construct the required
   * parameters ahead of construction time, and avoid partial initialization then
   *
   * @param connection - A URL or provider to connect to, one of:
   *     <ul>
   *       <li>JsonRpcProvider instance,</li>
   *       <li>a Metamask's web3.currentProvider object or,</li>
   *       <li>a hostname or remote json-rpc connection string</li>
   *     </ul>
   * @param account - An account to use as main account, one of:
   *     <ul>
   *       <li>Signer instance (e.g. Wallet) loadded with account/private key or</li>
   *       <li>hex-encoded string address of a remote account in provider or</li>
   *       <li>hex-encoded string local private key or</li>
   *       <li>number index of a remote account loaded in provider
   *            (e.g. 0 for Metamask's loaded account)</li>
   *     </ul>
   * @param storageOrState - Storage/localStorage-like synchronous object where to load and store
   *     current state or initial RaidenState-like object instead. In this case, user must listen
   *     state$ changes and update them on whichever persistency option is used
   * @param contracts - Contracts deployment info
   * @param config - Raiden configuration
   * @returns Promise to Raiden SDK client instance
   **/
  public static async create(
    connection: JsonRpcProvider | AsyncSendable | string,
    account: Signer | string | number,
    storageOrState?: Storage | RaidenState | unknown,
    contracts?: ContractsInfo,
    config?: Partial<RaidenConfig>,
  ): Promise<Raiden> {
    let provider: JsonRpcProvider;
    if (typeof connection === 'string') {
      provider = new JsonRpcProvider(connection);
    } else if (connection instanceof JsonRpcProvider) {
      provider = connection;
    } else {
      provider = new Web3Provider(connection);
    }

    // Patch provider's sign method (https://github.com/raiden-network/light-client/issues/223)
    patchSignSend(provider);

    const network = await provider.getNetwork();

    // if no ContractsInfo, try to populate from defaults
    if (!contracts) {
      switch (network.name) {
        case 'rinkeby':
          contracts = ({
            ...rinkebyDeploy.contracts,
            ...rinkebyServicesDeploy.contracts,
          } as unknown) as ContractsInfo;
          break;
        case 'ropsten':
          contracts = ({
            ...ropstenDeploy.contracts,
            ...ropstenServicesDeploy.contracts,
          } as unknown) as ContractsInfo;
          break;
        case 'kovan':
          contracts = ({
            ...kovanDeploy.contracts,
            ...kovanServicesDeploy.contracts,
          } as unknown) as ContractsInfo;
          break;
        case 'goerli':
          contracts = ({
            ...goerliDeploy.contracts,
            ...goerliServicesDeploy.contracts,
          } as unknown) as ContractsInfo;
          break;
        default:
          throw new Error(
            `No deploy info provided nor recognized network: ${JSON.stringify(network)}`,
          );
      }
    }

    let signer: Signer;
    if (Signer.isSigner(account)) {
      if (account.provider === provider) signer = account;
      else if (account instanceof Wallet) signer = account.connect(provider);
      else throw new Error(`Signer ${account} not connected to ${provider}`);
    } else if (typeof account === 'number') {
      // index of account in provider
      signer = provider.getSigner(account);
    } else if (Address.is(account)) {
      // address
      const accounts = await provider.listAccounts();
      if (!accounts.includes(account))
        throw new Error(`Account "${account}" not found in provider, got=${accounts}`);
      signer = provider.getSigner(account);
    } else if (PrivateKey.is(account)) {
      // private key
      signer = new Wallet(account, provider);
    } else {
      throw new Error('String account must be either a 0x-encoded address or private key');
    }
    const address = (await signer.getAddress()) as Address;

    // build an initial state and default config!
    let loadedState = makeInitialState({ network, address, contractsInfo: contracts }, { config });

    // type guard
    function isStorage(storageOrState: unknown): storageOrState is Storage {
      return storageOrState && typeof (storageOrState as Storage).getItem === 'function';
    }

    let onState: ((state: RaidenState) => void) | undefined = undefined,
      onStateComplete: (() => void) | undefined = undefined;

    if (storageOrState && isStorage(storageOrState)) {
      const ns = `raiden_${network.name || network.chainId}_${
        contracts.TokenNetworkRegistry.address
      }_${address}`;
      const loaded = _merge(
        {},
        loadedState,
        losslessParse((await storageOrState.getItem(ns)) || 'null'),
      );

      loadedState = decodeRaidenState(loaded);

      // to be subscribed on raiden.state$
      const debouncedState = debounce(
        (state: RaidenState): void => {
          storageOrState.setItem(ns, encodeRaidenState(state));
        },
        1000,
        { maxWait: 5000 },
      );
      onState = debouncedState;
      onStateComplete = () => debouncedState.flush();
    } else if (storageOrState && RaidenState.is(storageOrState)) {
      loadedState = storageOrState;
    } else if (storageOrState /* typeof storageOrState === unknown */) {
      loadedState = decodeRaidenState(storageOrState);
    }
    if (address !== loadedState.address)
      throw new Error(
        `Mismatch between provided account and loaded state: "${address}" !== "${loadedState.address}"`,
      );
    if (
      network.chainId !== loadedState.chainId ||
      contracts.TokenNetworkRegistry.address !== loadedState.registry
    )
      throw new Error(`Mismatch between network or registry address and loaded state`);

    const raiden = new Raiden(provider, network, signer, contracts, loadedState);
    if (onState) raiden.state$.subscribe(onState, onStateComplete, onStateComplete);
    return raiden;
  }

  /**
   * Starts redux/observables by subscribing to all epics and emitting initial state and action
   *
   * No event should be emitted before start is called
   */
  public start(): void {
    if (!this.epicMiddleware) throw new Error('Already started or stopped!');
    this.epicMiddleware.run(raidenRootEpic);
    // prevent start from being called again, turns this.started to true
    this.epicMiddleware = undefined;
    // dispatch a first, noop action, to next first state$ as current/initial state
    this.store.dispatch(raidenConfigUpdate({ config: {} }));
  }

  /**
   * Gets the running state of the instance
   *
   * @returns undefined if not yet started, true if running, false if already stopped
   */
  public get started(): boolean | undefined {
    // !epicMiddleware -> undefined | null -> undefined ? true/started : null/stopped;
    if (!this.epicMiddleware) return this.epicMiddleware === undefined;
    // else -> !!epicMiddleware -> not yet started -> returns undefined
  }

  /**
   * Triggers all epics to be unsubscribed
   */
  public stop(): void {
    // start still can't be called again, but turns this.started to false
    this.epicMiddleware = null;
    this.store.dispatch(raidenShutdown({ reason: ShutdownReason.STOP }));
  }

  private get state(): RaidenState {
    return this.store.getState();
  }

  /**
   * Get current account address
   *
   * @returns Instance address
   */
  public get address(): Address {
    return this.deps.address;
  }

  /**
   * Get current network from provider
   *
   * @returns Network object containing blockchain's name & chainId
   */
  public get network(): Network {
    return this.deps.network;
  }

  /**
   * Returns a promise to current block number, as seen in provider and state
   *
   * @returns Promise to current block number
   */
  public async getBlockNumber(): Promise<number> {
    return this.deps.provider.blockNumber || (await this.deps.provider.getBlockNumber());
  }

  /**
   * Getter for current Raiden Config
   *
   * @returns Current Raiden config
   */
  public get config(): RaidenConfig {
    return this.state.config;
  }

  /**
   * Update Raiden Config with a partial (shallow) object
   *
   * @param config - Partial object containing keys and values to update in config
   */
  public updateConfig(config: Partial<RaidenConfig>) {
    this.store.dispatch(raidenConfigUpdate({ config }));
  }

  /**
   * Get ETH balance for given address or self
   *
   * @param address - Optional target address. If omitted, gets own balance
   * @returns BigNumber of ETH balance
   */
  public getBalance(address?: string): Promise<BigNumber> {
    address = address || this.address;
    if (!Address.is(address)) throw new Error('Invalid address');
    return this.deps.provider.getBalance(address);
  }

  /**
   * Get token balance and token decimals for given address or self
   *
   * @param token - Token address to fetch balance. Must be one of the monitored tokens.
   * @param address - Optional target address. If omitted, gets own balance
   * @returns BigNumber containing address's token balance
   */
  public async getTokenBalance(token: string, address?: string): Promise<BigNumber> {
    address = address || this.address;
    if (!Address.is(address) || !Address.is(token)) throw new Error('Invalid address');
    if (!(token in this.state.tokens)) throw new Error(`token "${token}" not monitored`);
    const tokenContract = this.deps.getTokenContract(token);

    return tokenContract.functions.balanceOf(address);
  }

  /**
   * Returns a list of all token addresses registered as token networks in registry
   *
   * @returns Promise to list of token addresses
   */
  public async getTokenList(): Promise<Address[]> {
    // here we assume there'll be at least one token registered on a registry
    // so, if the list is empty (e.g. on first init), raidenInitializationEpic is still fetching
    // the TokenNetworkCreated events from registry, so we wait until some token is found
    return this.state$
      .pipe(
        first(state => !isEmpty(state.tokens)),
        map(state => Object.keys(state.tokens) as Address[]),
      )
      .toPromise();
  }

  /**
   * Open a channel on the tokenNetwork for given token address with partner
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @param options - (optional) option parameter
   * @param options.settleTimeout - Custom, one-time settle timeout
   * @returns txHash of channelOpen call, iff it succeeded
   */
  public async openChannel(
    token: string,
    partner: string,
    options: { settleTimeout?: number } = {},
  ): Promise<Hash> {
    if (!Address.is(token) || !Address.is(partner)) throw new Error('Invalid address');
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    if (!tokenNetwork) throw new Error('Unknown token network');
    const promise = this.action$
      .pipe(
        filter(isActionOf([channelOpened, channelOpenFailed])),
        filter(
          action => action.meta.tokenNetwork === tokenNetwork && action.meta.partner === partner,
        ),
        first(),
        map(action => {
          if (isActionOf(channelOpenFailed, action)) throw action.payload;
          return action.payload.txHash;
        }),
      )
      .toPromise();

    this.store.dispatch(channelOpen({ ...options }, { tokenNetwork, partner }));

    return promise;
  }

  /**
   * Deposit tokens on channel between us and partner on tokenNetwork for token
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @param amount - Number of tokens to deposit on channel
   * @returns txHash of setTotalDeposit call, iff it succeeded
   */
  public async depositChannel(
    token: string,
    partner: string,
    amount: BigNumberish,
  ): Promise<Hash> {
    if (!Address.is(token) || !Address.is(partner)) throw new Error('Invalid address');
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    if (!tokenNetwork) throw new Error('Unknown token network');

    const deposit = decode(UInt(32), amount);

    const promise = this.action$
      .pipe(
        filter(isActionOf([channelDeposited, channelDepositFailed])),
        filter(
          action => action.meta.tokenNetwork === tokenNetwork && action.meta.partner === partner,
        ),
        first(),
        map(action => {
          if (isActionOf(channelDepositFailed, action)) throw action.payload;
          return action.payload.txHash;
        }),
      )
      .toPromise();
    this.store.dispatch(channelDeposit({ deposit }, { tokenNetwork, partner }));
    return promise;
  }

  /**
   * Close channel between us and partner on tokenNetwork for token
   * This method will fail if called on a channel not in 'opened' or 'closing' state.
   * When calling this method on an 'opened' channel, its state becomes 'closing', and from there
   * on, no payments can be performed on the channel. If for any reason the closeChannel
   * transaction fails, channel's state stays as 'closing', and this method can be called again
   * to retry sending 'closeChannel' transaction. After it's successful, channel becomes 'closed',
   * and can be settled after 'settleTimeout' blocks (when it then becomes 'settleable').
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @returns txHash of closeChannel call, iff it succeeded
   */
  public async closeChannel(token: string, partner: string): Promise<Hash> {
    if (!Address.is(token) || !Address.is(partner)) throw new Error('Invalid address');
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    if (!tokenNetwork) throw new Error('Unknown token network');
    const promise = this.action$
      .pipe(
        filter(isActionOf([channelClosed, channelCloseFailed])),
        filter(
          action => action.meta.tokenNetwork === tokenNetwork && action.meta.partner === partner,
        ),
        first(),
        map(action => {
          if (isActionOf(channelCloseFailed, action)) throw action.payload;
          return action.payload.txHash;
        }),
      )
      .toPromise();
    this.store.dispatch(channelClose(undefined, { tokenNetwork, partner }));
    return promise;
  }

  /**
   * Settle channel between us and partner on tokenNetwork for token
   * This method will fail if called on a channel not in 'settleable' or 'settling' state.
   * Channel becomes 'settleable' settleTimeout blocks after closed (detected automatically
   * while Raiden Light Client is running or later on restart). When calling it, channel state
   * becomes 'settling'. If for any reason transaction fails, it'll stay on this state, and this
   * method can be called again to re-send a settleChannel transaction.
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @returns txHash of settleChannel call, iff it succeeded
   */
  public async settleChannel(token: string, partner: string): Promise<Hash> {
    if (!Address.is(token) || !Address.is(partner)) throw new Error('Invalid address');
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    if (!tokenNetwork) throw new Error('Unknown token network');
    // wait for the corresponding success or error action
    const promise = this.action$
      .pipe(
        filter(isActionOf([channelSettled, channelSettleFailed])),
        filter(
          action => action.meta.tokenNetwork === tokenNetwork && action.meta.partner === partner,
        ),
        first(),
        map(action => {
          if (isActionOf(channelSettleFailed, action)) throw action.payload;
          return action.payload.txHash;
        }),
      )
      .toPromise();
    this.store.dispatch(channelSettle(undefined, { tokenNetwork, partner }));
    return promise;
  }

  /**
   * Returns object describing address's users availability on transport
   * After calling this method, any further presence update to valid transport peers of this
   * address will trigger a corresponding MatrixPresenceUpdateAction on events$
   *
   * @param address - checksummed address to be monitored
   * @returns Promise to object describing availability and last event timestamp
   */
  public async getAvailability(
    address: string,
  ): Promise<{ userId: string; available: boolean; ts: number }> {
    if (!Address.is(address)) throw new Error('Invalid address');
    const promise = this.action$
      .pipe(
        filter(isActionOf([matrixPresenceUpdate, matrixRequestMonitorPresenceFailed])),
        filter(action => action.meta.address === address),
        first(),
        map(action => {
          if (isActionOf(matrixRequestMonitorPresenceFailed, action)) throw action.payload;
          return action.payload;
        }),
      )
      .toPromise();
    this.store.dispatch(matrixRequestMonitorPresence(undefined, { address }));
    return promise;
  }

  /**
   * Send a Locked Transfer!
   * This will reject if LockedTransfer signature prompt is canceled/signature fails, or be
   * resolved to the transfer unique identifier (secrethash) otherwise, and transfer status can be
   * queried with this id on this.transfers$ observable, which will just have emitted the 'pending'
   * transfer. Any following transfer state change will be notified through this observable.
   *
   * @param token - Token address on currently configured token network registry
   * @param target - Target address (must be getAvailability before)
   * @param value - Amount to try to transfer
   * @param options - Optional parameters for transfer:
   *    <ul>
   *      <li>paymentId - payment identifier, a random one will be generated if missing</li>
   *      <li>secret - Secret to register, a random one will be generated if missing</li>
   *      <li>secrethash - Must match secret, if both provided, or else, secret must be
   *          informed to target by other means, and reveal can't be performed</li>
   *      <li>paths - Used to specify possible routes & fees instead of querying PFS.</li>
   *    </ul>
   * @returns A promise to transfer's secrethash (unique id) when it's accepted
   */
  public async transfer(
    token: string,
    target: string,
    value: BigNumberish,
    options: {
      paymentId?: BigNumberish;
      secret?: string;
      secrethash?: string;
      paths?: RaidenPaths;
    } = {},
  ): Promise<Hash> {
    if (!Address.is(token) || !Address.is(target)) throw new Error('Invalid address');
    const tokenNetwork = this.state.tokens[token];
    if (!tokenNetwork) throw new Error('Unknown token network');

    const decodedValue = decode(UInt(32), value);
    const paymentId = options.paymentId ? decode(UInt(8), options.paymentId) : makePaymentId();
    const paths = options.paths ? decode(Paths, options.paths) : undefined;

    if (options.secret !== undefined && !Secret.is(options.secret))
      throw new Error('Invalid options.secret');
    if (options.secrethash !== undefined && !Hash.is(options.secrethash))
      throw new Error('Invalid options.secrethash');

    // use provided secret or create one if no secrethash was provided
    const secret = options.secret
        ? options.secret
        : !options.secrethash
        ? makeSecret()
        : undefined,
      secrethash = options.secrethash || getSecrethash(secret!);
    if (secret && getSecrethash(secret) !== secrethash)
      throw new Error('Provided secrethash must match the sha256 hash of provided secret');

    return merge(
      // wait for pathFind response
      this.action$.pipe(
        filter(isActionOf([pathFound, pathFindFailed])),
        first(
          action =>
            action.meta.tokenNetwork === tokenNetwork &&
            action.meta.target === target &&
            action.meta.value.eq(value),
        ),
        map(action => {
          if (isActionOf(pathFindFailed, action)) throw action.payload;
          return action.payload.paths;
        }),
      ),
      // request pathFind; even if paths were provided, send it again for validation
      // this is done at 'merge' subscription time (i.e. when above action filter is subscribed)
      defer(() => {
        this.store.dispatch(pathFind({ paths }, { tokenNetwork, target, value: decodedValue }));
        return EMPTY;
      }),
    )
      .pipe(
        mergeMap(paths =>
          merge(
            // wait for transfer response
            this.action$.pipe(
              filter(isActionOf([transferSigned, transferFailed])),
              first(action => action.meta.secrethash === secrethash),
              map(action => {
                if (isActionOf(transferFailed, action)) throw action.payload;
                return secrethash;
              }),
            ),
            // request transfer with returned/validated paths at 'merge' subscription time
            defer(() => {
              this.store.dispatch(
                transfer(
                  {
                    tokenNetwork,
                    target,
                    value: decodedValue,
                    paths,
                    paymentId,
                    secret,
                  },
                  { secrethash },
                ),
              );
              return EMPTY;
            }),
          ),
        ),
      )
      .toPromise();
  }

  /**
   * Request a path from PFS
   *
   * If a direct route is possible, it'll be returned. Else if PFS is set up, a request will be
   * performed and the cleaned/validated path results will be resolved.
   * Else, if no route can be found, promise is rejected with respective error.
   *
   * @param token - Token address on currently configured token network registry
   * @param target - Target address (must be getAvailability before)
   * @param value - Minimum capacity required on routes
   * @returns A promise to returned routes/paths result
   */
  public async findRoutes(
    token: string,
    target: string,
    value: BigNumberish,
  ): Promise<RaidenPaths> {
    if (!Address.is(token) || !Address.is(target)) throw new Error('Invalid address');
    const tokenNetwork = this.state.tokens[token];
    if (!tokenNetwork) throw new Error('Unknown token network');

    const decodedValue = decode(UInt(32), value);

    const promise = this.action$
      .pipe(
        filter(isActionOf([pathFound, pathFindFailed])),
        first(
          action =>
            action.meta.tokenNetwork === tokenNetwork &&
            action.meta.target === target &&
            action.meta.value.eq(value),
        ),
        map(action => {
          if (isActionOf(pathFindFailed, action)) throw action.payload;
          return action.payload.paths;
        }),
      )
      .toPromise();
    this.store.dispatch(pathFind({}, { tokenNetwork, target, value: decodedValue }));
    return promise;
  }
}

export default Raiden;
