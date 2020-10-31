import './polyfills';
import type { Signer } from '@ethersproject/abstract-signer';
import { Web3Provider, JsonRpcProvider, ExternalProvider } from '@ethersproject/providers';
import { Network } from '@ethersproject/networks';
import { BigNumber, BigNumberish } from '@ethersproject/bignumber';
import { Zero, AddressZero, MaxUint256 } from '@ethersproject/constants';

import { MatrixClient } from 'matrix-js-sdk';
import { applyMiddleware, createStore, Store } from 'redux';
import { createEpicMiddleware, EpicMiddleware } from 'redux-observable';
import { createLogger } from 'redux-logger';

import constant from 'lodash/constant';
import memoize from 'lodash/memoize';
import { Observable, AsyncSubject, merge, defer, EMPTY, ReplaySubject, of } from 'rxjs';
import { first, filter, map, mergeMap, skip, pluck } from 'rxjs/operators';
import logging from 'loglevel';

import { TokenNetworkRegistryFactory } from './contracts/TokenNetworkRegistryFactory';
import { TokenNetworkFactory } from './contracts/TokenNetworkFactory';
import { HumanStandardTokenFactory } from './contracts/HumanStandardTokenFactory';
import { ServiceRegistryFactory } from './contracts/ServiceRegistryFactory';
import { CustomTokenFactory } from './contracts/CustomTokenFactory';
import { UserDepositFactory } from './contracts/UserDepositFactory';
import { SecretRegistryFactory } from './contracts/SecretRegistryFactory';
import { MonitoringServiceFactory } from './contracts/MonitoringServiceFactory';

import versions from './versions.json';
import { ContractsInfo, EventTypes, OnChange, RaidenEpicDeps, Latest } from './types';
import { ShutdownReason } from './constants';
import { RaidenState } from './state';
import { RaidenConfig, PartialRaidenConfig, makeDefaultConfig } from './config';
import { RaidenChannels, ChannelState } from './channels/state';
import { RaidenTransfer, Direction, TransferState } from './transfers/state';
import { raidenReducer } from './reducer';
import { raidenRootEpic, getLatest$ } from './epics';
import {
  RaidenAction,
  RaidenEvents,
  RaidenEvent,
  raidenShutdown,
  raidenConfigUpdate,
} from './actions';
import { assert } from './utils';
import {
  channelOpen,
  channelDeposit,
  channelClose,
  channelSettle,
  tokenMonitored,
} from './channels/actions';
import { channelKey, channelAmounts } from './channels/utils';
import { matrixPresence } from './transport/actions';
import { transfer, transferSigned, withdraw } from './transfers/actions';
import {
  makeSecret,
  getSecrethash,
  makePaymentId,
  raidenTransfer,
  transferKey,
  transferKeyToMeta,
} from './transfers/utils';
import { pathFind, udcWithdraw, udcDeposit } from './services/actions';
import { Paths, RaidenPaths, PFS, RaidenPFS, IOU } from './services/types';
import { pfsListInfo } from './services/utils';
import { Address, Secret, Storage, Hash, UInt, decode } from './utils/types';
import { isActionOf, asyncActionToPromise, isResponseOf } from './utils/actions';
import { patchSignSend } from './utils/ethers';
import { pluckDistinct } from './utils/rx';
import {
  getContracts,
  getSigner,
  initTransfers$,
  mapRaidenChannels,
  chooseOnchainAccount,
  getContractWithSigner,
  waitConfirmation,
  callAndWaitMined,
  fetchContractsInfo,
  getUdcBalance,
  getState,
} from './helpers';
import { RaidenError, ErrorCodes } from './utils/error';
import { RaidenDatabase } from './db/types';
import { dumpDatabaseToArray } from './db/utils';
import { createPersisterMiddleware } from './persister';

export class Raiden {
  private readonly store: Store<RaidenState, RaidenAction>;
  private readonly deps: RaidenEpicDeps;

  /**
   * action$ exposes the internal events pipeline. It's intended for debugging, and its interface
   * must not be relied on, as its actions interfaces and structures can change without warning.
   */
  public readonly action$: Observable<RaidenAction>;
  /**
   * state$ is exposed only so user can listen to state changes and persist them somewhere else.
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
   * Every time a transfer state is updated, it's emitted here. 'key' property is unique and
   * may be used as identifier to know which transfer got updated.
   */
  public readonly transfers$: Observable<RaidenTransfer>;

  /** RaidenConfig object */
  public config!: RaidenConfig;
  /** RaidenConfig observable (for reactive use)  */
  public config$: Observable<RaidenConfig>;

  /**
   * Expose ether's Provider.resolveName for ENS support
   */
  public readonly resolveName: (name: string) => Promise<Address>;

  /**
   * The address of the token that is used to pay the services.
   */
  public userDepositTokenAddress: () => Promise<Address>;

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
    this: Raiden,
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

  /** Instance's Logger, compatible with console's API */
  private readonly log: logging.Logger;

  public constructor(
    provider: JsonRpcProvider,
    network: Network,
    signer: Signer,
    contractsInfo: ContractsInfo,
    {
      db,
      state,
      config,
    }: { state: RaidenState; db: RaidenDatabase; config?: PartialRaidenConfig },
    main?: { address: Address; signer: Signer },
  ) {
    const address = state.address;
    this.resolveName = provider.resolveName.bind(provider) as (name: string) => Promise<Address>;
    this.log = logging.getLogger(`raiden:${address}`);

    const defaultConfig = makeDefaultConfig(
      { network },
      config && decode(PartialRaidenConfig, config),
    );

    // use next from latest known blockNumber as start block when polling
    provider.resetEventsBlock(state.blockNumber + 1);

    const latest$ = new ReplaySubject<Latest>(1);

    // pipe cached state
    this.state$ = latest$.pipe(pluckDistinct('state'));
    // pipe action, skipping cached
    this.action$ = latest$.pipe(pluckDistinct('action'), skip(1));
    this.channels$ = this.state$.pipe(pluckDistinct('channels'), map(mapRaidenChannels));
    this.transfers$ = initTransfers$(this.state$, db);
    this.events$ = this.action$.pipe(filter(isActionOf(RaidenEvents)));

    this.getTokenInfo = memoize(async function (this: Raiden, token: string) {
      assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
      const tokenContract = this.deps.getTokenContract(token);
      const [totalSupply, decimals, name, symbol] = await Promise.all([
        tokenContract.callStatic.totalSupply(),
        tokenContract.callStatic.decimals(),
        tokenContract.callStatic.name().catch(constant(undefined)),
        tokenContract.callStatic.symbol().catch(constant(undefined)),
      ]);
      // workaround for https://github.com/microsoft/TypeScript/issues/33752
      assert(totalSupply && decimals != null, ErrorCodes.RDN_NOT_A_TOKEN, this.log.info);
      return { totalSupply, decimals, name, symbol };
    });

    this.deps = {
      latest$,
      config$: latest$.pipe(pluckDistinct('config')),
      matrix$: new AsyncSubject<MatrixClient>(),
      provider,
      network,
      signer,
      address,
      log: this.log,
      defaultConfig,
      contractsInfo,
      registryContract: TokenNetworkRegistryFactory.connect(
        contractsInfo.TokenNetworkRegistry.address,
        main?.signer ?? signer,
      ),
      getTokenNetworkContract: memoize((address: Address) =>
        TokenNetworkFactory.connect(address, main?.signer ?? signer),
      ),
      getTokenContract: memoize((address: Address) =>
        HumanStandardTokenFactory.connect(address, main?.signer ?? signer),
      ),
      serviceRegistryContract: ServiceRegistryFactory.connect(
        contractsInfo.ServiceRegistry.address,
        main?.signer ?? signer,
      ),
      userDepositContract: UserDepositFactory.connect(
        contractsInfo.UserDeposit.address,
        main?.signer ?? signer,
      ),
      secretRegistryContract: SecretRegistryFactory.connect(
        contractsInfo.SecretRegistry.address,
        main?.signer ?? signer,
      ),
      monitoringServiceContract: MonitoringServiceFactory.connect(
        contractsInfo.MonitoringService.address,
        main?.signer ?? signer,
      ),
      main,
      db,
    };

    this.userDepositTokenAddress = memoize(
      async () => (await this.deps.userDepositContract.callStatic.token()) as Address,
    );

    const loggerMiddleware = createLogger({
      predicate: () => this.log.getLevel() <= logging.levels.INFO,
      logger: this.log,
      level: {
        prevState: false,
        action: 'info',
        error: 'error',
        nextState: 'debug',
      },
    });

    this.config$ = this.deps.config$;
    this.config$.subscribe((config) => (this.config = config));

    // minimum blockNumber of contracts deployment as start scan block
    this.epicMiddleware = createEpicMiddleware<
      RaidenAction,
      RaidenAction,
      RaidenState,
      RaidenEpicDeps
    >({ dependencies: this.deps });
    const persisterMiddleware = createPersisterMiddleware(db);

    this.store = createStore(
      raidenReducer,
      // workaround for redux's PreloadedState issues with branded values
      state as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      applyMiddleware(loggerMiddleware, persisterMiddleware, this.epicMiddleware),
    );

    // populate deps.latest$, to ensure config, logger && pollingInterval are setup before start
    getLatest$(
      of(raidenConfigUpdate({})),
      of(this.store.getState()),
      this.deps,
    ).subscribe((latest) => this.deps.latest$.next(latest));
  }

  /**
   * Async helper factory to make a Raiden instance from more common parameters.
   *
   * An async factory is needed so we can do the needed async requests to construct the required
   * parameters ahead of construction time, and avoid partial initialization then
   *
   * @param this - Raiden class or subclass
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
   * @param storage - Storage/localStorage-like object from where to load and store current
   * state, initial RaidenState-like object, or a { storage; state? } object containing both.
   * If a storage isn't provided, user must listen state$ changes on ensure it's persisted.
   * @param storage.state - State uploaded by user; should be decodable by RaidenState;
   *    it is auto-migrated
   * @param storage.storage - Legacy localStorage; will load states from there if matching
   * @param storage.adapter - PouchDB adapter; default to 'indexeddb' on browsers and 'leveldb' on
   *    node. If you provide a custom one, ensure you call PouchDB.plugin on it.
   * @param storage.prefix - Database name prefix; use to set a directory to store leveldown db;
   * @param contractsOrUDCAddress - Contracts deployment info, or UserDeposit contract address
   * @param config - Raiden configuration
   * @param subkey - Whether to use a derived subkey or not
   * @returns Promise to Raiden SDK client instance
   */
  public static async create<R extends typeof Raiden>(
    this: R,
    connection: JsonRpcProvider | ExternalProvider | string,
    account: Signer | string | number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storage?: { state?: any; storage?: Storage; adapter?: any; prefix?: string },
    contractsOrUDCAddress?: ContractsInfo | string,
    config?: PartialRaidenConfig,
    subkey?: true,
  ): Promise<InstanceType<R>> {
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
    let contractsInfo;
    if (!contractsOrUDCAddress) {
      contractsInfo = getContracts(network);
    } else if (typeof contractsOrUDCAddress === 'string') {
      // if an Address is provided, use it as UserDeposit contract address entrypoint and fetch
      // all contracts from there
      assert(Address.is(contractsOrUDCAddress), [
        ErrorCodes.DTA_INVALID_ADDRESS,
        { contractsOrUserDepositAddress: contractsOrUDCAddress },
      ]);
      contractsInfo = await fetchContractsInfo(provider, contractsOrUDCAddress);
    } else {
      contractsInfo = contractsOrUDCAddress;
    }

    const { signer, address, main } = await getSigner(account, provider, subkey);

    // Build initial state or parse from database
    const { state, db } = await getState(
      { network, contractsInfo, address, log: logging.getLogger(`raiden:${address}`) },
      storage,
    );

    assert(address === state.address, [
      ErrorCodes.RDN_STATE_ADDRESS_MISMATCH,
      {
        account: address,
        state: state.address,
      },
    ]);
    assert(
      network.chainId === state.chainId &&
        contractsInfo.TokenNetworkRegistry.address === state.registry,
      [
        ErrorCodes.RDN_STATE_NETWORK_MISMATCH,
        {
          network: network.chainId,
          contracts: contractsInfo.TokenNetworkRegistry.address,
          stateNetwork: state.chainId,
          stateRegistry: state.registry,
        },
      ],
    );

    return new this(
      provider,
      network,
      signer,
      contractsInfo,
      { db, state, config },
      main,
    ) as InstanceType<R>;
  }

  /**
   * Starts redux/observables by subscribing to all epics and emitting initial state and action
   *
   * No event should be emitted before start is called
   */
  public start(): void {
    assert(this.epicMiddleware, ErrorCodes.RDN_ALREADY_STARTED, this.log.info);
    this.log.info('Starting Raiden Light-Client', {
      prevBlockNumber: this.state.blockNumber,
      address: this.address,
      TokenNetworkRegistry: this.deps.contractsInfo.TokenNetworkRegistry.address,
      network: { name: this.deps.network.name, chainId: this.deps.network.chainId },
      'raiden-ts': Raiden.version,
      'raiden-contracts': Raiden.contractVersion,
      config: this.config,
    });

    // Set `epicMiddleware` to `null`, this indicates the instance is not running.
    const observerComplete = {
      complete: () => (this.epicMiddleware = null),
    };
    this.deps.latest$.subscribe(observerComplete);

    this.epicMiddleware.run(raidenRootEpic);
    // prevent start from being called again, turns this.started to true
    this.epicMiddleware = undefined;
    // dispatch a first, noop action, to next first state$ as current/initial state
    this.store.dispatch(raidenConfigUpdate({}));
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
    // this.epicMiddleware is set to null by latest$'s complete callback
    if (this.started) this.store.dispatch(raidenShutdown({ reason: ShutdownReason.STOP }));
  }

  /**
   * Get current RaidenState object. Can be serialized safely with [[encodeRaidenState]]
   *
   * @returns Current Raiden state
   */
  public get state(): RaidenState {
    return this.store.getState();
  }

  /**
   * Get current account address (subkey's address, if subkey is being used)
   *
   * @returns Instance address
   */
  public get address(): Address {
    return this.deps.address;
  }

  /**
   * Get main account address (if subkey is being used, undefined otherwise)
   *
   * @returns Main account address
   */
  public get mainAddress(): Address | undefined {
    return this.deps.main?.address;
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
   * Returns the currently used SDK version.
   *
   * @returns SDK version
   */
  static get version(): string {
    return versions.sdk;
  }

  /**
   * Returns the version of the used Smart Contracts.
   *
   * @returns Smart Contract version
   */
  static get contractVersion(): string {
    return versions.contracts;
  }

  /**
   * Returns the Smart Contracts addresses and deployment blocks
   *
   * @returns Smart Contracts info
   */
  get contractsInfo(): ContractsInfo {
    return this.deps.contractsInfo;
  }

  /**
   * Update Raiden Config with a partial (shallow) object
   *
   * @param config - Partial object containing keys and values to update in config
   */
  public updateConfig(config: PartialRaidenConfig) {
    this.store.dispatch(raidenConfigUpdate(decode(PartialRaidenConfig, config)));
  }

  /**
   * Dumps database content for backup
   *
   * @returns JSON object or array containing database content
   */
  public async dumpDatabase() {
    // only wait for db to be closed if it was started
    if (this.started !== undefined) await this.deps.db.busy$.toPromise();
    return dumpDatabaseToArray(this.deps.db);
  }

  /**
   * Get ETH balance for given address or self
   *
   * @param address - Optional target address. If omitted, gets own balance
   * @returns BigNumber of ETH balance
   */
  public getBalance(address?: string): Promise<BigNumber> {
    address = address ?? chooseOnchainAccount(this.deps, this.config.subkey).address;
    assert(Address.is(address), [ErrorCodes.DTA_INVALID_ADDRESS, { address }], this.log.info);
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
    address = address ?? chooseOnchainAccount(this.deps, this.config.subkey).address;
    assert(Address.is(address), [ErrorCodes.DTA_INVALID_ADDRESS, { address }], this.log.info);
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);

    const tokenContract = this.deps.getTokenContract(token);
    return tokenContract.callStatic.balanceOf(address);
  }

  /**
   * Returns a list of all token addresses registered as token networks in registry
   *
   * @returns Promise to list of token addresses
   */
  public async getTokenList(): Promise<Address[]> {
    return this.deps.provider
      .getLogs({
        ...this.deps.registryContract.filters.TokenNetworkCreated(null, null),
        fromBlock: this.deps.contractsInfo.TokenNetworkRegistry.block_number,
        toBlock: 'latest',
      })
      .then((logs) =>
        logs
          .map((log) => this.deps.registryContract.interface.parseLog(log))
          .filter((parsed) => !!parsed.args.token_address)
          .map((parsed) => parsed.args.token_address as Address),
      );
  }

  /**
   * Scans initially and start monitoring a token for channels with us, returning its Tokennetwork
   * address
   *
   * Throws an exception if token isn't registered in current registry
   *
   * @param token - token address to monitor, must be registered in current token network registry
   * @returns Address of TokenNetwork contract
   */
  public async monitorToken(token: string): Promise<Address> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    let tokenNetwork = this.state.tokens[token];
    if (tokenNetwork) return tokenNetwork;
    tokenNetwork = (await this.deps.registryContract.token_to_token_networks(token)) as Address;
    assert(
      tokenNetwork && tokenNetwork !== AddressZero,
      ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK,
      this.log.info,
    );
    this.store.dispatch(
      tokenMonitored({
        token,
        tokenNetwork,
        fromBlock: this.deps.contractsInfo.TokenNetworkRegistry.block_number,
      }),
    );
    return tokenNetwork;
  }
  /**
   * Open a channel on the tokenNetwork for given token address with partner
   *
   * If token isn't yet monitored, starts monitoring it
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @param options - (optional) option parameter
   * @param options.settleTimeout - Custom, one-time settle timeout
   * @param options.subkey - Whether to use the subkey for on-chain tx or main account (default)
   * @param options.deposit - Deposit to perform in parallel with channel opening
   * @param onChange - Optional callback for status change notification
   * @returns txHash of channelOpen call, iff it succeeded
   */
  public async openChannel(
    token: string,
    partner: string,
    options: { settleTimeout?: number; subkey?: boolean; deposit?: BigNumberish } = {},
    onChange?: OnChange<EventTypes, { txHash: string }>,
  ): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(partner), [ErrorCodes.DTA_INVALID_ADDRESS, { partner }], this.log.info);
    const tokenNetwork = await this.monitorToken(token);
    assert(!options.subkey || this.deps.main, ErrorCodes.RDN_SUBKEY_NOT_SET, this.log.info);

    // Note that we use the advantage of the UInt decoding here, but immediately
    // convert it to a plain number again.
    const settleTimeout = !options.settleTimeout
      ? undefined
      : decode(
          UInt(4),
          options.settleTimeout,
          ErrorCodes.DTA_INVALID_TIMEOUT,
          this.log.info,
        ).toNumber();

    const deposit = !options.deposit
      ? undefined
      : decode(UInt(32), options.deposit, ErrorCodes.DTA_INVALID_DEPOSIT, this.log.info);

    const meta = { tokenNetwork, partner };
    // wait for confirmation
    const openPromise = asyncActionToPromise(channelOpen, meta, this.action$, true).then(
      ({ txHash }) => txHash, // pluck txHash
    );
    let depositPromise;
    if (deposit?.gt(0)) {
      depositPromise = asyncActionToPromise(channelDeposit, meta, this.action$, true).then(
        ({ txHash }) => txHash, // pluck txHash
      );
    }

    this.store.dispatch(channelOpen.request({ ...options, settleTimeout, deposit }, meta));

    const openTxHash = await openPromise;
    onChange?.({ type: EventTypes.OPENED, payload: { txHash: openTxHash } });

    await this.state$
      .pipe(
        pluckDistinct('channels', channelKey({ tokenNetwork, partner }), 'state'),
        first((state) => state === ChannelState.open),
      )
      .toPromise();
    onChange?.({ type: EventTypes.CONFIRMED, payload: { txHash: openTxHash } });

    if (depositPromise) {
      const depositTx = await depositPromise;
      onChange?.({ type: EventTypes.DEPOSITED, payload: { txHash: depositTx } });
    }

    return openTxHash;
  }

  /**
   * Deposit tokens on channel between us and partner on tokenNetwork for token
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @param amount - Number of tokens to deposit on channel
   * @param options - tx options
   * @param options.subkey - By default, if using subkey, main account is used to send transactions
   *    (and is also the account used as source of the deposit tokens).
   *    Set this to true if one wants to force sending the transaction with the subkey, and using
   *    tokens held in the subkey.
   * @returns txHash of setTotalDeposit call, iff it succeeded
   */
  public async depositChannel(
    token: string,
    partner: string,
    amount: BigNumberish,
    { subkey }: { subkey?: boolean } = {},
  ): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(partner), [ErrorCodes.DTA_INVALID_ADDRESS, { partner }], this.log.info);
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);
    assert(!subkey || this.deps.main, ErrorCodes.RDN_SUBKEY_NOT_SET, this.log.info);

    const deposit = decode(UInt(32), amount, ErrorCodes.DTA_INVALID_DEPOSIT, this.log.info);
    const meta = { tokenNetwork, partner };
    const promise = asyncActionToPromise(channelDeposit, meta, this.action$, true).then(
      ({ txHash }) => txHash,
    );
    this.store.dispatch(channelDeposit.request({ deposit, subkey }, meta));
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
   * @param options - tx options
   * @param options.subkey - By default, if using subkey, main account is used to send transactions
   *    Set this to true if one wants to force sending the transaction with the subkey
   * @returns txHash of closeChannel call, iff it succeeded
   */
  public async closeChannel(
    token: string,
    partner: string,
    { subkey }: { subkey?: boolean } = {},
  ): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(partner), [ErrorCodes.DTA_INVALID_ADDRESS, { partner }], this.log.info);
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);
    assert(!subkey || this.deps.main, ErrorCodes.RDN_SUBKEY_NOT_SET, this.log.info);

    const meta = { tokenNetwork, partner };
    const promise = asyncActionToPromise(channelClose, meta, this.action$, true).then(
      ({ txHash }) => txHash,
    );
    this.store.dispatch(channelClose.request(subkey ? { subkey } : undefined, meta));
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
   * @param options - tx options
   * @param options.subkey - By default, if using subkey, main account is used to send transactions
   *    Set this to true if one wants to force sending the transaction with the subkey
   * @returns txHash of settleChannel call, iff it succeeded
   */
  public async settleChannel(
    token: string,
    partner: string,
    { subkey }: { subkey?: boolean } = {},
  ): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(partner), [ErrorCodes.DTA_INVALID_ADDRESS, { partner }], this.log.info);
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);
    assert(!subkey || this.deps.main, ErrorCodes.RDN_SUBKEY_NOT_SET, this.log.info);

    // wait for the corresponding success or error action
    const meta = { tokenNetwork, partner };
    const promise = asyncActionToPromise(channelSettle, meta, this.action$, true).then(
      ({ txHash }) => txHash,
    );
    this.store.dispatch(channelSettle.request(subkey ? { subkey } : undefined, meta));
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
    assert(Address.is(address), [ErrorCodes.DTA_INVALID_ADDRESS, { address }], this.log.info);
    const meta = { address };
    const promise = asyncActionToPromise(matrixPresence, meta, this.action$);
    this.store.dispatch(matrixPresence.request(undefined, meta));
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
   * @param target - Target address
   * @param value - Amount to try to transfer
   * @param options - Optional parameters for transfer:
   * @param options.paymentId - payment identifier, a random one will be generated if missing</li>
   * @param options.secret - Secret to register, a random one will be generated if missing</li>
   * @param options.secrethash - Must match secret, if both provided, or else, secret must be
   *     informed to target by other means, and reveal can't be performed</li>
   * @param options.paths - Used to specify possible routes & fees instead of querying PFS.</li>
   * @param options.pfs - Use this PFS instead of configured or automatically choosen ones.
   *     Is ignored if paths were already provided. If neither are set and config.pfs is not
   *     disabled (null), use it if set or if undefined (auto mode), fetches the best
   *     PFS from ServiceRegistry and automatically fetch routes from it.</li>
   * @param options.lockTimeout - Specify a lock timeout for transfer; default is 2 * revealTimeout
   * @returns A promise to transfer's unique key (id) when it's accepted
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
      pfs?: RaidenPFS;
      lockTimeout?: number;
    } = {},
  ): Promise<string> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(target), [ErrorCodes.DTA_INVALID_ADDRESS, { target }], this.log.info);
    const tokenNetwork = this.state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);

    const decodedValue = decode(UInt(32), value, ErrorCodes.DTA_INVALID_AMOUNT, this.log.info);
    const paymentId =
      options.paymentId !== undefined
        ? decode(UInt(8), options.paymentId, ErrorCodes.DTA_INVALID_PAYMENT_ID, this.log.info)
        : makePaymentId();
    const paths = !options.paths
      ? undefined
      : decode(Paths, options.paths, ErrorCodes.DTA_INVALID_PATH, this.log.info);
    const pfs = !options.pfs
      ? undefined
      : decode(PFS, options.pfs, ErrorCodes.DTA_INVALID_PFS, this.log.info);
    // if undefined, default expiration is calculated at locked's [[makeAndSignTransfer$]]
    const expiration = !options.lockTimeout
      ? undefined
      : this.state.blockNumber + options.lockTimeout;

    assert(
      options.secret === undefined || Secret.is(options.secret),
      ErrorCodes.RDN_INVALID_SECRET,
      this.log.info,
    );
    assert(
      options.secrethash === undefined || Hash.is(options.secrethash),
      ErrorCodes.RDN_INVALID_SECRETHASH,
      this.log.info,
    );

    // use provided secret or create one if no secrethash was provided
    const secret = options.secret
      ? options.secret
      : !options.secrethash
      ? makeSecret()
      : undefined;
    const secrethash = options.secrethash || getSecrethash(secret!);
    assert(
      !secret || getSecrethash(secret) === secrethash,
      ErrorCodes.RDN_SECRET_SECRETHASH_MISMATCH,
      this.log.info,
    );

    const pathFindMeta = { tokenNetwork, target, value: decodedValue };
    return merge(
      // wait for pathFind response
      this.action$.pipe(
        first(isResponseOf(pathFind, pathFindMeta)),
        map((action) => {
          if (pathFind.failure.is(action)) throw action.payload;
          return action.payload.paths;
        }),
      ),
      // request pathFind; even if paths were provided, send it again for validation
      // this is done at 'merge' subscription time (i.e. when above action filter is subscribed)
      defer(() => {
        this.store.dispatch(pathFind.request({ paths, pfs }, pathFindMeta));
        return EMPTY;
      }),
    )
      .pipe(
        mergeMap((paths) =>
          merge(
            // wait for transfer response
            this.action$.pipe(
              filter(isActionOf([transferSigned, transfer.failure])),
              first(
                (action) =>
                  action.meta.direction === Direction.SENT &&
                  action.meta.secrethash === secrethash,
              ),
              map((action) => {
                if (transfer.failure.is(action)) throw action.payload;
                return transferKey(action.meta);
              }),
            ),
            // request transfer with returned/validated paths at 'merge' subscription time
            defer(() => {
              this.store.dispatch(
                transfer.request(
                  {
                    tokenNetwork,
                    target,
                    value: decodedValue,
                    paths,
                    paymentId,
                    secret,
                    expiration,
                  },
                  { secrethash, direction: Direction.SENT },
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
   * Waits for the transfer identified by a secrethash to fail or complete
   * The returned promise will resolve with the final transfer state, or reject if anything fails
   *
   * @param transferKey - Transfer identifier as returned by [[transfer]]
   * @returns Promise to final RaidenTransfer
   */
  public async waitTransfer(transferKey: string): Promise<RaidenTransfer> {
    const { direction, secrethash } = transferKeyToMeta(transferKey);
    let transferState = this.state.transfers[transferKey];
    if (!transferState)
      try {
        transferState = decode(TransferState, await this.deps.db.get(transferKey));
      } catch (e) {}
    assert(transferState, ErrorCodes.RDN_UNKNOWN_TRANSFER, this.log.info);

    const raidenTransf = raidenTransfer(transferState);
    // already completed/past transfer
    if (raidenTransf.completed) {
      if (raidenTransf.success) return raidenTransf;
      else
        throw new RaidenError(ErrorCodes.XFER_ALREADY_COMPLETED, { status: raidenTransf.status });
    }

    // throws/rejects if a failure occurs
    await asyncActionToPromise(transfer, { secrethash, direction }, this.action$);
    const finalState = await this.state$
      .pipe(
        pluck('transfers', transferKey),
        first((transferState) => !!transferState.unlockProcessed),
      )
      .toPromise();
    this.log.info('Transfer successful', {
      key: transferKey,
      partner: finalState.partner,
      initiator: finalState.transfer.initiator,
      target: finalState.transfer.target,
      fee: finalState.fee.toString(),
      lockAmount: finalState.transfer.lock.amount.toString(),
      targetReceived: finalState.secretRequest?.amount.toString(),
      transferTime: finalState.unlockProcessed!.ts - finalState.transfer.ts,
    });
    return raidenTransfer(finalState);
  }

  /**
   * Request a path from PFS
   *
   * If a direct route is possible, it'll be returned. Else if PFS is set up, a request will be
   * performed and the cleaned/validated path results will be resolved.
   * Else, if no route can be found, promise is rejected with respective error.
   *
   * @param token - Token address on currently configured token network registry
   * @param target - Target address
   * @param value - Minimum capacity required on routes
   * @param options - Optional parameters
   * @param options.pfs - Use this PFS instead of configured or automatically choosen ones
   * @returns A promise to returned routes/paths result
   */
  public async findRoutes(
    token: string,
    target: string,
    value: BigNumberish,
    options: { pfs?: RaidenPFS } = {},
  ): Promise<Paths> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(target), [ErrorCodes.DTA_INVALID_ADDRESS, { target }], this.log.info);
    const tokenNetwork = this.state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);

    const decodedValue = decode(UInt(32), value);
    const pfs = options.pfs ? decode(PFS, options.pfs) : undefined;
    const meta = { tokenNetwork, target, value: decodedValue };
    const promise = asyncActionToPromise(pathFind, meta, this.action$).then(
      ({ paths }) => paths, // pluck paths
    );
    this.store.dispatch(pathFind.request({ pfs }, meta));
    return promise;
  }

  /**
   * Checks if a direct transfer of token to target could be performed and returns it on a
   * single-element array of Paths
   *
   * @param token - Token address on currently configured token network registry
   * @param target - Target address
   * @param value - Minimum capacity required on route
   * @returns Promise to a [Raiden]Paths array containing the single, direct route, or undefined
   */
  public async directRoute(
    token: string,
    target: string,
    value: BigNumberish,
  ): Promise<Paths | undefined> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(target), [ErrorCodes.DTA_INVALID_ADDRESS, { target }], this.log.info);
    const tokenNetwork = this.state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);

    const decodedValue = decode(UInt(32), value);

    const meta = { tokenNetwork, target, value: decodedValue };
    const promise = asyncActionToPromise(pathFind, meta, this.action$).then(
      ({ paths }) => paths, // pluck paths
      () => undefined, // on reject, omit and return undefined instead
    );
    // dispatch a pathFind with pfs disabled, to force checking for a direct route
    this.store.dispatch(pathFind.request({ pfs: null }, meta));
    return promise;
  }

  /**
   * Returns a sorted array of info of available PFS
   *
   * It uses data polled from ServiceRegistry, which is available only when config.pfs is
   * undefined, instead of set or disabled (null), and will reject if not.
   * It can reject if the validated list is empty, meaning we can be out-of-sync (we're outdated or
   * they are) with PFSs deployment, or no PFS is available on this TokenNetwork/blockchain.
   *
   * @returns Promise to array of PFS, which is the interface which describes a PFS
   */
  public async findPFS(): Promise<PFS[]> {
    assert(this.config.pfs !== null, ErrorCodes.PFS_DISABLED, this.log.info);
    return (this.config.pfs
      ? of<readonly (string | Address)[]>([this.config.pfs])
      : this.deps.latest$.pipe(
          pluckDistinct('pfsList'),
          first((v) => v.length > 0),
        )
    )
      .pipe(mergeMap((pfsList) => pfsListInfo(pfsList, this.deps)))
      .toPromise();
  }

  /**
   * Mints the amount of tokens of the provided token address.
   * Throws an error, if
   * <ol>
   *  <li>Executed on main net</li>
   *  <li>`token` or `options.to` is not a valid address</li>
   *  <li>Token could not be minted</li>
   * </ol>
   *
   * @param token - Address of the token to be minted
   * @param amount - Amount to be minted
   * @param options - tx options
   * @param options.subkey - By default, if using subkey, main account is used to send transactions
   *    Notice the beneficiary here is always the account that sends the transaction, as this is
   *    expectedly also the account that will pay for e.g. future deposits.
   *    Set this to true if one wants to force sending the transaction with the subkey
   * @param options.to - Beneficiary, defaults to mainAddress or address
   * @returns transaction
   */
  public async mint(
    token: string,
    amount: BigNumberish,
    { subkey, to }: { subkey?: boolean; to?: string } = {},
  ): Promise<Hash> {
    // Check whether address is valid
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(!subkey || this.deps.main, ErrorCodes.RDN_SUBKEY_NOT_SET, this.log.info);

    // Check whether we are on a test network
    assert(this.deps.network.chainId !== 1, ErrorCodes.RDN_MINT_MAINNET, this.log.info);

    const { signer, address } = chooseOnchainAccount(this.deps, subkey ?? this.config.subkey);
    // Mint token
    const customTokenContract = CustomTokenFactory.connect(token, signer);

    const beneficiary = to ?? address;
    assert(
      Address.is(beneficiary),
      [ErrorCodes.DTA_INVALID_ADDRESS, { beneficiary }],
      this.log.info,
    );

    const value = decode(UInt(32), amount, ErrorCodes.DTA_INVALID_AMOUNT);
    const receipt = await callAndWaitMined(
      customTokenContract,
      'mintFor',
      [value, beneficiary],
      ErrorCodes.RDN_MINT_FAILED,
      { log: this.log },
    );

    // wait for a single block, so future calls will correctly pick value
    await waitConfirmation(receipt, this.deps, 1);
    return receipt.transactionHash as Hash;
  }

  /**
   * Fetches balance of UserDeposit Contract for SDK's account minus cached spent IOUs
   *
   * @returns Promise to UDC remaining capacity
   */
  public async getUDCCapacity(): Promise<BigNumber> {
    const balance = await getUdcBalance(this.deps.latest$);
    const blockNumber = this.state.blockNumber;
    const owedAmount = Object.values(this.state.iou)
      .reduce(
        (acc, value) => [
          ...acc,
          ...Object.values(value).filter((value) => value.expiration_block.gte(blockNumber)),
        ],
        [] as IOU[],
      )
      .reduce((acc, iou) => acc.add(iou.amount), Zero);
    return balance.sub(owedAmount);
  }

  /**
   * Deposits the amount to the UserDeposit contract with the target/signer as a beneficiary.
   * The deposited amount can be used as a collateral in order to sign valid IOUs that will
   * be accepted by the Services.
   *
   * Throws an error, in the following cases:
   * <ol>
   *  <li>The amount specified equals to zero</li>
   *  <li>The target has an insufficient token balance</li>
   *  <li>The "approve" transaction fails with an error</li>
   *  <li>The "deposit" transaction fails with an error</li>
   * </ol>
   *
   * @param amount - The amount to deposit on behalf of the target/beneficiary.
   * @param onChange - callback providing notifications about state changes
   * @param options - tx options
   * @param options.subkey - By default, if using subkey, main account is used to send transactions
   *    Set this to true if one wants to force sending the transaction with the subkey
   * @returns transaction hash
   */
  public async depositToUDC(
    amount: BigNumberish,
    onChange?: OnChange<EventTypes, { txHash: string }>,
    { subkey }: { subkey?: boolean } = {},
  ): Promise<Hash> {
    assert(!subkey || this.deps.main, ErrorCodes.RDN_SUBKEY_NOT_SET, this.log.info);

    const deposit = decode(UInt(32), amount, ErrorCodes.DTA_INVALID_DEPOSIT, this.log.info);
    assert(deposit.gt(Zero), ErrorCodes.DTA_NON_POSITIVE_NUMBER, this.log.info);
    const deposited = await this.deps.userDepositContract.callStatic.total_deposit(this.address);
    const meta = { totalDeposit: deposited.add(deposit) as UInt<32> };

    const mined = asyncActionToPromise(udcDeposit, meta, this.action$, false).then(
      (res) => res.txHash,
    );
    this.store.dispatch(udcDeposit.request({ deposit, subkey }, meta));

    let txHash = await mined;
    onChange?.({ type: EventTypes.DEPOSITED, payload: { txHash: txHash! } });

    const confirmed = asyncActionToPromise(udcDeposit, meta, this.action$, true).then(
      (res) => res.txHash,
    );
    txHash = await confirmed;
    onChange?.({ type: EventTypes.CONFIRMED, payload: { txHash } });
    return txHash;
  }

  /**
   * Transfer value ETH on-chain to address.
   * If subkey is being used, use main account by default, or subkey account if 'subkey' is true
   * Example:
   *   // transfer 0.1 ETH from main account to subkey account, when subkey is used
   *   await raiden.transferOnchainBalance(raiden.address, parseEther('0.1'));
   *   // transfer entire balance from subkey account back to main account
   *   await raiden.transferOnchainBalance(raiden.mainAddress, undefined, { subkey: true });
   *
   * @param to - Recipient address
   * @param value - Amount of ETH (in Wei) to transfer. Use ethers/utils::parseEther if needed
   *    Defaults to a very big number, which will cause all entire balance to be transfered
   * @param options - tx options
   * @param options.subkey - By default, if using subkey, main account is used to send transactions
   *    Set this to true if one wants to force sending the transaction with the subkey
   * @param options.gasPrice - Set to force a specific gasPrice; used to calculate transferable
   *    amount when transfering entire balance. If left unset, uses average network gasPrice
   * @returns transaction hash
   */
  public async transferOnchainBalance(
    to: string,
    value: BigNumberish = MaxUint256,
    { subkey, gasPrice }: { subkey?: boolean; gasPrice?: BigNumberish } = {},
  ): Promise<Hash> {
    assert(Address.is(to), [ErrorCodes.DTA_INVALID_ADDRESS, { to }], this.log.info);
    assert(!subkey || this.deps.main, ErrorCodes.RDN_SUBKEY_NOT_SET, this.log.info);

    const { signer, address } = chooseOnchainAccount(this.deps, subkey ?? this.config.subkey);

    const price = gasPrice ? BigNumber.from(gasPrice) : await this.deps.provider.getGasPrice();
    const gasLimit = BigNumber.from(21000);

    const curBalance = await this.getBalance(address);
    // transferableBalance is current balance minus the cost of a single transfer as per gasPrice
    const transferableBalance = curBalance.sub(price.mul(gasLimit));
    assert(
      transferableBalance.gt(Zero),
      [ErrorCodes.RDN_INSUFFICIENT_BALANCE, { transferable: transferableBalance.toString() }],
      this.log.info,
    );

    // caps value to transferableBalance, so if it's too big, transfer all
    const amount = transferableBalance.lte(value) ? transferableBalance : BigNumber.from(value);

    const tx = await signer.sendTransaction({ to, value: amount, gasPrice: price, gasLimit });
    const receipt = await tx.wait();

    assert(receipt.status, ErrorCodes.RDN_TRANSFER_ONCHAIN_BALANCE_FAILED, this.log.info);
    return tx.hash! as Hash;
  }

  /**
   * Transfer value tokens on-chain to address.
   * If subkey is being used, use main account by default, or subkey account if 'subkey' is true
   *
   * @param token - Token address
   * @param to - Recipient address
   * @param value - Amount of tokens (in Wei) to transfer. Use ethers/utils::parseUnits if needed
   *    Defaults to a very big number, which will cause all entire balance to be transfered
   * @param options - tx options
   * @param options.subkey - By default, if using subkey, main account is used to send transactions
   *    Set this to true if one wants to force sending the transaction with the subkey
   * @returns transaction hash
   */
  public async transferOnchainTokens(
    token: string,
    to: string,
    value: BigNumberish = MaxUint256,
    { subkey }: { subkey?: boolean } = {},
  ): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(to), [ErrorCodes.DTA_INVALID_ADDRESS, { to }], this.log.info);
    assert(!subkey || this.deps.main, ErrorCodes.RDN_SUBKEY_NOT_SET, this.log.info);

    const { signer, address } = chooseOnchainAccount(this.deps, subkey ?? this.config.subkey);
    const tokenContract = getContractWithSigner(this.deps.getTokenContract(token), signer);

    const curBalance = await this.getTokenBalance(token, address);
    // caps value to balance, so if it's too big, transfer all
    const amount = curBalance.lte(value) ? curBalance : BigNumber.from(value);

    const receipt = await callAndWaitMined(
      tokenContract,
      'transfer',
      [to, amount],
      ErrorCodes.RDN_TRANSFER_ONCHAIN_TOKENS_FAILED,
      { log: this.log },
    );
    return receipt.transactionHash as Hash;
  }

  public async planUdcWithdraw(value: BigNumberish): Promise<Hash> {
    const meta = {
      amount: decode(UInt(32), value, ErrorCodes.DTA_INVALID_AMOUNT, this.log.error),
    };
    const promise = asyncActionToPromise(udcWithdraw, meta, this.action$, true).then(
      ({ txHash }) => txHash!,
    );
    this.store.dispatch(udcWithdraw.request(undefined, meta));
    return promise;
  }

  /**
   * Requests to withdraw from channel
   *
   * The requested amount defaults to the maximum withdrawable amount, which is exposed in
   * [[channels$]] observable as the [[RaidenChannel.ownWithdrawable]] member.
   * This involves requesting partner a signature which confirms they agree that we have the right
   * for this amount of tokens, then a transaction is sent on-chain to withdraw tokens to the
   * effective account.
   * If this process fails, the amount remains locked until it can be expired later (defaults to
   * 2 * config.revealTimeout blocks).
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @param amount - Amount of tokens (in wei) to withdraw, must be between 1 and ownWithdrawable
   * @returns Promise to the hash of the mined withdraw transaction
   */
  public async withdrawChannel(
    token: string,
    partner: string,
    amount?: BigNumberish,
  ): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(partner), [ErrorCodes.DTA_INVALID_ADDRESS, { partner }], this.log.info);
    const tokenNetwork = this.state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);
    const channel = this.state.channels[channelKey({ tokenNetwork, partner })];
    assert(
      channel?.state === ChannelState.open,
      ErrorCodes.CNL_NO_OPEN_CHANNEL_FOUND,
      this.log.error,
    );
    const { ownWithdrawable, ownWithdraw } = channelAmounts(channel);
    const requestedAmount = decode(
      UInt(32),
      amount ?? ownWithdrawable, // if not provided, defaults to whole withdrawable amount
      ErrorCodes.DTA_INVALID_AMOUNT,
      this.log.info,
    );
    // if it's too big, it'll fail on withdraw request handling epic
    const totalWithdraw = ownWithdraw.add(requestedAmount) as UInt<32>;
    const expiration = this.state.blockNumber + 2 * this.config.revealTimeout;

    const meta = {
      direction: Direction.SENT,
      tokenNetwork,
      partner,
      totalWithdraw,
      expiration,
    };
    const promise = asyncActionToPromise(withdraw, meta, this.action$, true).then(
      ({ txHash }) => txHash,
    );
    this.store.dispatch(withdraw.request(undefined, meta));
    return promise;
  }
}

export default Raiden;
