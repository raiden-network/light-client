import './polyfills';

import type { Signer } from '@ethersproject/abstract-signer';
import type { BigNumberish } from '@ethersproject/bignumber';
import { BigNumber } from '@ethersproject/bignumber';
import { AddressZero, MaxUint256, Zero } from '@ethersproject/constants';
import type { Network } from '@ethersproject/networks';
import type { ExternalProvider } from '@ethersproject/providers';
import { JsonRpcProvider, Web3Provider } from '@ethersproject/providers';
import isUndefined from 'lodash/isUndefined';
import memoize from 'lodash/memoize';
import omitBy from 'lodash/omitBy';
import logging from 'loglevel';
import type { Store } from 'redux';
import { applyMiddleware, createStore } from 'redux';
import { composeWithDevTools } from 'redux-devtools-extension/developmentOnly';
import { createLogger } from 'redux-logger';
import type { EpicMiddleware } from 'redux-observable';
import { createEpicMiddleware } from 'redux-observable';
import type { Observable } from 'rxjs';
import { EMPTY, firstValueFrom, from, lastValueFrom, of } from 'rxjs';
import { fromFetch } from 'rxjs/fetch';
import {
  catchError,
  concatMap,
  filter,
  first,
  map,
  mergeMap,
  pluck,
  skip,
  timeout,
  toArray,
} from 'rxjs/operators';

import type { RaidenAction, RaidenEvent, raidenSynced } from './actions';
import { raidenConfigUpdate, RaidenEvents, raidenShutdown, raidenStarted } from './actions';
import {
  channelClose,
  channelDeposit,
  channelOpen,
  channelSettle,
  tokenMonitored,
} from './channels/actions';
import type { RaidenChannels } from './channels/state';
import { ChannelState } from './channels/state';
import { channelAmounts, channelKey, transact } from './channels/utils';
import type { RaidenConfig } from './config';
import { intervalFromConfig, PartialRaidenConfig } from './config';
import { ShutdownReason } from './constants';
import { CustomToken__factory } from './contracts';
import { dumpDatabase } from './db/utils';
import { combineRaidenEpics, getLatest$ } from './epics';
import {
  chooseOnchainAccount,
  getContractWithSigner,
  getSigner,
  getState,
  getUdcBalance,
  initTransfers$,
  makeDependencies,
  makeSyncedPromise,
  makeTokenInfoGetter,
  mapRaidenChannels,
  waitChannelSettleable$,
  waitConfirmation,
} from './helpers';
import { createPersisterMiddleware } from './persister';
import { raidenReducer } from './reducer';
import { pathFind, udcDeposit, udcWithdraw, udcWithdrawPlan } from './services/actions';
import type { IOU, Paths, RaidenPFS, SuggestedPartner } from './services/types';
import { InputPaths, PFS, PfsMode, SuggestedPartners } from './services/types';
import { pfsListInfo } from './services/utils';
import type { RaidenState } from './state';
import { transfer, transferSigned, withdraw, withdrawResolve } from './transfers/actions';
import type { RaidenTransfer } from './transfers/state';
import { Direction, TransferState } from './transfers/state';
import {
  getSecrethash,
  makePaymentId,
  makeSecret,
  raidenTransfer,
  transferKey,
  transferKeyToMeta,
} from './transfers/utils';
import { matrixPresence } from './transport/actions';
import type { ContractsInfo, OnChange, RaidenEpicDeps } from './types';
import { EventTypes } from './types';
import { assert } from './utils';
import { asyncActionToPromise, isActionOf } from './utils/actions';
import { jsonParse } from './utils/data';
import { commonTxErrors, ErrorCodes, RaidenError } from './utils/error';
import { getLogsByChunk$ } from './utils/ethers';
import { pluckDistinct, retryWhile } from './utils/rx';
import type { Decodable } from './utils/types';
import { Address, decode, Hash, Secret, UInt } from './utils/types';
import versions from './versions.json';

export class Raiden {
  /**
   * action$ exposes the internal events pipeline. It's intended for debugging, and its interface
   * must not be relied on, as its actions interfaces and structures can change without warning.
   */
  public readonly action$: Observable<RaidenAction> = this.deps.latest$.pipe(
    pluckDistinct('action'),
    skip(1),
  );
  /**
   * state$ is exposed only so user can listen to state changes and persist them somewhere else.
   * Format/content of the emitted objects are subject to changes and not part of the public API
   */
  public readonly state$: Observable<RaidenState> = this.deps.latest$.pipe(pluckDistinct('state'));
  /**
   * channels$ is public interface, exposing a view of the currently known channels
   * Its format is expected to be kept backwards-compatible, and may be relied on
   */
  public readonly channels$: Observable<RaidenChannels> = this.state$.pipe(
    pluckDistinct('channels'),
    map(mapRaidenChannels),
  );
  /**
   * A subset ot RaidenActions exposed as public events.
   * The interface of the objects emitted by this Observable are expected not to change internally,
   * but more/new events may be added over time.
   */
  public readonly events$: Observable<RaidenEvent> = this.action$.pipe(
    filter(isActionOf(RaidenEvents)),
  );

  /**
   * Observable of completed and pending transfers
   * Every time a transfer state is updated, it's emitted here. 'key' property is unique and
   * may be used as identifier to know which transfer got updated.
   */
  public readonly transfers$: Observable<RaidenTransfer> = initTransfers$(
    this.state$,
    this.deps.db,
  );

  /** RaidenConfig object */
  public config!: RaidenConfig;
  /** RaidenConfig observable (for reactive use) */
  public config$: Observable<RaidenConfig> = this.deps.config$;
  /** Observable of latest average (10) block times */
  public blockTime$: Observable<number> = this.deps.latest$.pipe(pluckDistinct('blockTime'));

  /** When started, is set to a promise which resolves when node finishes syncing */
  public synced: Promise<raidenSynced['payload'] | undefined> = makeSyncedPromise(this.action$);

  /**
   * Get constant token details from token contract, caches it.
   * Rejects only if 'token' contract doesn't define totalSupply and decimals methods.
   * name and symbol may be undefined, as they aren't actually part of ERC20 standard, although
   * very common and defined on most token contracts.
   *
   * @param token - address to fetch info from
   * @returns token info
   */
  public getTokenInfo = makeTokenInfoGetter(this.deps);

  private readonly store: Store<RaidenState, RaidenAction>;

  /** Expose ether's Provider.resolveName for ENS support */
  public readonly resolveName = this.deps.provider.resolveName.bind(this.deps.provider) as (
    name: string,
  ) => Promise<Address>;

  /** The address of the token that is used to pay the services (SVT/RDN).  */
  public userDepositTokenAddress: () => Promise<Address> = memoize(
    async () => this.deps.userDepositContract.callStatic.token() as Promise<Address>,
  );

  private epicMiddleware?: EpicMiddleware<
    RaidenAction,
    RaidenAction,
    RaidenState,
    RaidenEpicDeps
  > | null;

  /**
   * Constructs a Raiden instance from state machine parameters
   *
   * It expects ready Redux and Epics params, with some async members already resolved and set in
   * place, therefore this constructor is expected to be used only for tests and advancecd usage
   * where finer control is needed to tweak how some of these members are initialized;
   * Most users should usually prefer the [[create]] async factory, which already takes care of
   * these async initialization steps and accepts more common parameters.
   *
   * @param state - Validated and decoded initial/rehydrated RaidenState
   * @param deps - Constructed epics dependencies object, including signer, provider, fetched
   *    network and contracts information.
   * @param epic - State machine root epic
   * @param reducer - State machine root reducer
   */
  public constructor(
    state: RaidenState,
    private readonly deps: RaidenEpicDeps,
    private readonly epic = combineRaidenEpics(),
    reducer = raidenReducer,
  ) {
    // use next from latest known blockNumber as start block when polling
    deps.provider.resetEventsBlock(state.blockNumber + 1);

    const isBrowser = !!globalThis?.location;
    const loggerMiddleware = createLogger({
      predicate: () => this.log.getLevel() <= logging.levels.INFO,
      logger: this.log,
      level: {
        prevState: false,
        action: 'info',
        error: 'error',
        nextState: 'debug',
      },
      ...(isBrowser ? {} : { colors: false }),
    });

    // minimum blockNumber of contracts deployment as start scan block
    this.epicMiddleware = createEpicMiddleware<
      RaidenAction,
      RaidenAction,
      RaidenState,
      RaidenEpicDeps
    >({ dependencies: deps });
    const persisterMiddleware = createPersisterMiddleware(deps.db);

    this.store = createStore(
      reducer,
      // workaround for redux's PreloadedState issues with branded values
      state as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      composeWithDevTools(
        applyMiddleware(loggerMiddleware, persisterMiddleware, this.epicMiddleware),
      ),
    );

    deps.config$.subscribe((config) => (this.config = config));

    // populate deps.latest$, to ensure config, logger && pollingInterval are setup before start
    getLatest$(of(raidenConfigUpdate({})), of(this.store.getState()), deps).subscribe((latest) =>
      deps.latest$.next(latest),
    );
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
   *       <li>Signer instance (e.g. Wallet) loaded with account/private key or</li>
   *       <li>hex-encoded string address of a remote account in provider or</li>
   *       <li>hex-encoded string local private key or</li>
   *       <li>number index of a remote account loaded in provider
   *            (e.g. 0 for Metamask's loaded account)</li>
   *     </ul>
   * @param storage - diverse storage related parameters to load from and save to
   * @param storage.state - State uploaded by user; should be decodable by RaidenState;
   *    it is auto-migrated
   * @param storage.adapter - PouchDB adapter; default to 'indexeddb' on browsers and 'leveldb' on
   *    node. If you provide a custom one, ensure you call PouchDB.plugin on it.
   * @param storage.prefix - Database name prefix; use to set a directory to store leveldown db;
   * @param contractsOrUDCAddress - Contracts deployment info, or UserDeposit contract address
   * @param config - Raiden configuration
   * @param subkey - Whether to use a derived subkey or not
   * @param subkeyOriginUrl - URL of origin to generate a subkey for (defaults
   *    to global context)
   * @returns Promise to Raiden SDK client instance
   */
  public static async create<R extends typeof Raiden>(
    this: R,
    connection: JsonRpcProvider | ExternalProvider | string,
    account: Signer | string | number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    storage?: { state?: any; adapter?: any; prefix?: string },
    contractsOrUDCAddress?: ContractsInfo | string,
    config?: Decodable<PartialRaidenConfig>,
    subkey?: true,
    subkeyOriginUrl?: string,
  ): Promise<InstanceType<R>> {
    let provider: JsonRpcProvider;
    if (typeof connection === 'string') {
      provider = new JsonRpcProvider(connection);
    } else if (connection instanceof JsonRpcProvider) {
      provider = connection;
    } else {
      provider = new Web3Provider(connection);
    }

    const network = await provider.getNetwork();
    const { signer, address, main } = await getSigner(account, provider, subkey, subkeyOriginUrl);

    // Build initial state or parse from database
    const { state, db } = await getState(
      { provider, network, address, log: logging.getLogger(`raiden:${address}`) },
      contractsOrUDCAddress,
      storage,
    );
    const contractsInfo = state.contracts;

    assert(address === state.address, [
      ErrorCodes.RDN_STATE_ADDRESS_MISMATCH,
      {
        account: address,
        state: state.address,
      },
    ]);
    assert(network.chainId === state.chainId, [
      ErrorCodes.RDN_STATE_NETWORK_MISMATCH,
      {
        network: network.chainId,
        contracts: contractsInfo,
        stateNetwork: state.chainId,
      },
    ]);
    const cleanConfig = config && decode(PartialRaidenConfig, omitBy(config, isUndefined));

    const deps = makeDependencies(state, cleanConfig, { signer, contractsInfo, db, main });
    return new this(state, deps) as InstanceType<R>;
  }

  /**
   * Starts redux/observables by subscribing to all epics and emitting initial state and action
   *
   * No event should be emitted before start is called
   */
  public async start(): Promise<void> {
    assert(this.epicMiddleware, ErrorCodes.RDN_ALREADY_STARTED, this.log.info);
    this.log.info('Starting Raiden Light-Client', {
      prevBlockNumber: this.state.blockNumber,
      address: this.address,
      contracts: this.deps.contractsInfo,
      network: this.deps.network,
      'raiden-ts': Raiden.version,
      'raiden-contracts': Raiden.contractVersion,
      config: this.config,
      versions: process?.versions,
    });

    // Set `epicMiddleware` to `null`, this indicates the instance is not running.
    this.deps.latest$.subscribe({
      complete: () => (this.epicMiddleware = null),
    });

    this.epicMiddleware.run(this.epic);
    // prevent start from being called again, turns this.started to true
    this.epicMiddleware = undefined;
    // dispatch a first, noop action, to next first state$ as current/initial state
    this.store.dispatch(raidenStarted());
    await this.synced;
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
  public async stop(): Promise<void> {
    // start still can't be called again, but turns this.started to false
    // this.epicMiddleware is set to null by latest$'s complete callback
    if (this.started) this.store.dispatch(raidenShutdown({ reason: ShutdownReason.STOP }));
    if (this.started !== undefined)
      await lastValueFrom(this.deps.db.busy$, { defaultValue: undefined });
  }

  /**
   * Instance's Logger, compatible with console's API
   *
   * @returns Logger object
   */
  public get log() {
    return this.deps.log;
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
   * Current provider getter
   *
   * @returns ether's provider instance
   */
  public get provider(): JsonRpcProvider {
    return this.deps.provider;
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
    const lastBlockNumber = this.deps.provider.blockNumber;
    if (
      lastBlockNumber &&
      lastBlockNumber >= this.deps.contractsInfo.TokenNetworkRegistry.block_number
    )
      return lastBlockNumber;
    else return await this.deps.provider.getBlockNumber();
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
    if ('mediationFees' in config)
      // just validate, it's set in getLatest$
      this.deps.mediationFeeCalculator.decodeConfig(
        config.mediationFees,
        this.deps.defaultConfig.mediationFees,
      );
    this.store.dispatch(raidenConfigUpdate(decode(PartialRaidenConfig, config)));
  }

  /**
   * Dumps database content for backup
   *
   * @yields Rows of objects
   */
  public async *dumpDatabase() {
    yield* dumpDatabase(this.deps.db);
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
    return await lastValueFrom(
      getLogsByChunk$(this.deps.provider, {
        ...this.deps.registryContract.filters.TokenNetworkCreated(),
        fromBlock: this.deps.contractsInfo.TokenNetworkRegistry.block_number,
        toBlock: await this.getBlockNumber(),
      }).pipe(
        map((log) => this.deps.registryContract.interface.parseLog(log)),
        filter((parsed) => !!parsed.args['token_address']),
        map((parsed) => parsed.args['token_address'] as Address),
        toArray(),
      ),
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
   * @param options.deposit - Deposit to perform in parallel with channel opening
   * @param options.confirmConfirmation - Whether to wait `confirmationBlocks` after last
   *    transaction confirmation; default=true if confirmationBlocks
   * @param onChange - Optional callback for status change notification
   * @returns txHash of channelOpen call, iff it succeeded
   */
  public async openChannel(
    token: string,
    partner: string,
    options: {
      deposit?: BigNumberish;
      confirmConfirmation?: boolean;
    } = {},
    onChange?: OnChange<EventTypes, { txHash: string }>,
  ): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(partner), [ErrorCodes.DTA_INVALID_ADDRESS, { partner }], this.log.info);
    const tokenNetwork = await this.monitorToken(token);

    const deposit = !options.deposit
      ? undefined
      : decode(UInt(32), options.deposit, ErrorCodes.DTA_INVALID_DEPOSIT, this.log.info);
    const confirmConfirmation = options.confirmConfirmation ?? !!this.config.confirmationBlocks;

    const meta = { tokenNetwork, partner };
    // wait for confirmation
    const openPromise = asyncActionToPromise(channelOpen, meta, this.action$).then(
      ({ txHash }) => {
        onChange?.({ type: EventTypes.OPENED, payload: { txHash } });
        return txHash; // pluck txHash
      },
    );
    const openConfirmedPromise = asyncActionToPromise(channelOpen, meta, this.action$, true).then(
      ({ txHash }) => {
        onChange?.({ type: EventTypes.CONFIRMED, payload: { txHash } });
        return txHash; // pluck txHash
      },
    );

    let depositPromise: Promise<Hash> | undefined;
    if (deposit?.gt(0)) {
      depositPromise = asyncActionToPromise(
        channelDeposit,
        meta,
        this.action$.pipe(
          // ensure we only react on own deposit's responses
          filter(
            (action) =>
              !channelDeposit.success.is(action) || action.payload.participant === this.address,
          ),
        ),
        true,
      ).then(({ txHash }) => {
        onChange?.({ type: EventTypes.DEPOSITED, payload: { txHash } });
        return txHash; // pluck txHash
      });
    }

    this.store.dispatch(channelOpen.request({ ...options, deposit }, meta));

    const [, openTxHash, depositTxHash] = await Promise.all([
      openPromise,
      openConfirmedPromise,
      depositPromise,
    ]);

    if (confirmConfirmation) {
      // wait twice confirmationBlocks for deposit or open tx
      await waitConfirmation(
        await this.deps.provider.getTransactionReceipt(depositTxHash ?? openTxHash),
        this.deps,
        this.config.confirmationBlocks * 2,
      );
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
   * @param options.confirmConfirmation - Whether to wait `confirmationBlocks` after last
   *    transaction confirmation; default=true if config.confirmationBlocks
   * @returns txHash of setTotalDeposit call, iff it succeeded
   */
  public async depositChannel(
    token: string,
    partner: string,
    amount: BigNumberish,
    {
      confirmConfirmation = !!this.config.confirmationBlocks,
    }: { confirmConfirmation?: boolean } = {},
  ): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(partner), [ErrorCodes.DTA_INVALID_ADDRESS, { partner }], this.log.info);
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);

    const deposit = decode(UInt(32), amount, ErrorCodes.DTA_INVALID_DEPOSIT, this.log.info);
    const meta = { tokenNetwork, partner };

    const promise = asyncActionToPromise(
      channelDeposit,
      meta,
      this.action$.pipe(
        // ensure we only react on own deposit's responses
        filter(
          (action) =>
            !channelDeposit.success.is(action) || action.payload.participant === this.address,
        ),
      ),
      true,
    ).then(({ txHash }) => txHash);

    this.store.dispatch(channelDeposit.request({ deposit }, meta));
    const depositTxHash = await promise;

    if (confirmConfirmation) {
      // wait twice confirmationBlocks for deposit or open tx
      await waitConfirmation(
        await this.deps.provider.getTransactionReceipt(depositTxHash),
        this.deps,
        this.config.confirmationBlocks * 2,
      );
    }

    return depositTxHash;
  }

  /**
   * Close channel between us and partner on tokenNetwork for token
   * This method will fail if called on a channel not in 'opened' or 'closing' state.
   * When calling this method on an 'opened' channel, its state becomes 'closing', and from there
   * on, no payments can be performed on the channel. If for any reason the closeChannel
   * transaction fails, channel's state stays as 'closing', and this method can be called again
   * to retry sending 'closeChannel' transaction. After it's successful, channel becomes 'closed',
   * and can be settled after 'settleTimeout' seconds (when it then becomes 'settleable').
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @returns txHash of closeChannel call, iff it succeeded
   */
  public async closeChannel(token: string, partner: string): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(partner), [ErrorCodes.DTA_INVALID_ADDRESS, { partner }], this.log.info);
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);

    // try coop-settle first
    try {
      const channel = this.state.channels[channelKey({ tokenNetwork, partner })];
      assert(channel, 'channel not found');
      const { ownTotalWithdrawable: totalWithdraw } = channelAmounts(channel);
      const expiration = Math.ceil(
        Date.now() / 1e3 + this.config.revealTimeout * this.config.expiryFactor,
      );

      const coopMeta = {
        direction: Direction.SENT,
        tokenNetwork,
        partner,
        totalWithdraw,
        expiration,
      };
      const coopPromise = asyncActionToPromise(withdraw, coopMeta, this.action$, true).then(
        ({ txHash }) => txHash,
      );
      this.store.dispatch(withdrawResolve({ coopSettle: true }, coopMeta));
      return await coopPromise;
    } catch (err) {
      this.log.info('Could not settle cooperatively, performing uncooperative close', err);
    }

    const meta = { tokenNetwork, partner };
    const promise = asyncActionToPromise(channelClose, meta, this.action$, true).then(
      ({ txHash }) => txHash,
    );
    this.store.dispatch(channelClose.request(undefined, meta));
    return promise;
  }

  /**
   * Settle channel between us and partner on tokenNetwork for token
   * This method will fail if called on a channel not in 'settleable' or 'settling' state.
   * Channel becomes 'settleable' settleTimeout seconds after closed (detected automatically
   * while Raiden Light Client is running or later on restart). When calling it, channel state
   * becomes 'settling'. If for any reason transaction fails, it'll stay on this state, and this
   * method can be called again to re-send a settleChannel transaction.
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @returns txHash of settleChannel call, iff it succeeded
   */
  public async settleChannel(token: string, partner: string): Promise<Hash> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    assert(Address.is(partner), [ErrorCodes.DTA_INVALID_ADDRESS, { partner }], this.log.info);
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);
    assert(!this.config.autoSettle, ErrorCodes.CNL_SETTLE_AUTO_ENABLED, this.log.info);

    const meta = { tokenNetwork, partner };
    // wait for channel to become settleable
    await lastValueFrom(waitChannelSettleable$(this.state$, meta));

    // wait for the corresponding success or error action
    const promise = asyncActionToPromise(channelSettle, meta, this.action$, true).then(
      ({ txHash }) => txHash,
    );
    this.store.dispatch(channelSettle.request(undefined, meta));
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
   * @param options.paymentId - payment identifier, a random one will be generated if missing
   * @param options.secret - Secret to register, a random one will be generated if missing
   * @param options.secrethash - Must match secret, if both provided, or else, secret must be
   *     informed to target by other means, and reveal can't be performed
   * @param options.paths - Used to specify possible routes & fees instead of querying PFS.
   *     Should receive a decodable super-set of the public RaidenPaths interface
   * @param options.pfs - Use this PFS instead of configured or automatically choosen ones.
   *     Is ignored if paths were already provided. If neither are set and config.pfs is not
   *     disabled (null), use it if set or if undefined (auto mode), fetches the best
   *     PFS from ServiceRegistry and automatically fetch routes from it.
   * @param options.lockTimeout - Specify a lock timeout for transfer;
   *     default is expiryFactor * revealTimeout
   * @param options.encryptSecret - Whether to force encrypting the secret or not,
   *     if target supports it
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
      paths?: Decodable<InputPaths>;
      pfs?: RaidenPFS;
      lockTimeout?: number;
      encryptSecret?: boolean;
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
    const paths =
      options.paths &&
      decode(InputPaths, options.paths, ErrorCodes.DTA_INVALID_PATH, this.log.info);
    const pfs = options.pfs && decode(PFS, options.pfs, ErrorCodes.DTA_INVALID_PFS, this.log.info);

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
    const secret = options.secret || (options.secrethash ? undefined : makeSecret());
    const secrethash = options.secrethash || getSecrethash(secret!);
    assert(
      !secret || getSecrethash(secret) === secrethash,
      ErrorCodes.RDN_SECRET_SECRETHASH_MISMATCH,
      this.log.info,
    );

    const promise = firstValueFrom(
      this.action$.pipe(
        filter(isActionOf([transferSigned, transfer.failure])),
        filter(({ meta }) => meta.direction === Direction.SENT && meta.secrethash === secrethash),
        map((action) => {
          if (transfer.failure.is(action)) throw action.payload;
          return transferKey(action.meta);
        }),
      ),
    );
    this.store.dispatch(
      transfer.request(
        {
          tokenNetwork,
          target,
          value: decodedValue,
          paymentId,
          secret,
          resolved: false,
          paths,
          pfs,
          lockTimeout: options.lockTimeout,
          encryptSecret: options.encryptSecret,
        },
        { secrethash, direction: Direction.SENT },
      ),
    );
    return promise;
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
    const finalState = await firstValueFrom(
      this.state$.pipe(
        pluck('transfers', transferKey),
        filter((transferState) => !!transferState.unlockProcessed),
      ),
    );
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
    assert(this.config.pfsMode !== PfsMode.disabled, ErrorCodes.PFS_DISABLED, this.log.info);
    await this.synced;
    const services = [...this.config.additionalServices];
    if (this.config.pfsMode === PfsMode.auto) services.push(...Object.keys(this.state.services));
    return lastValueFrom(pfsListInfo(services, this.deps));
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
   * @param options.to - Beneficiary, defaults to mainAddress or address
   * @returns transaction
   */
  public async mint(
    token: string,
    amount: BigNumberish,
    { to }: { to?: string } = {},
  ): Promise<Hash> {
    // Check whether address is valid
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);

    // Check whether we are on a test network
    assert(this.deps.network.chainId !== 1, ErrorCodes.RDN_MINT_MAINNET, this.log.info);

    const { signer, address } = chooseOnchainAccount(this.deps, this.config.subkey);
    // Mint token
    const customTokenContract = CustomToken__factory.connect(token, signer);

    const beneficiary = to ?? address;
    assert(
      Address.is(beneficiary),
      [ErrorCodes.DTA_INVALID_ADDRESS, { beneficiary }],
      this.log.info,
    );

    const value = decode(UInt(32), amount, ErrorCodes.DTA_INVALID_AMOUNT);
    const [, receipt] = await lastValueFrom(
      transact(customTokenContract, 'mintFor', [value, beneficiary], this.deps, {
        error: ErrorCodes.RDN_MINT_FAILED,
      }),
    );

    // wait for a single block, so future calls will correctly pick value
    await waitConfirmation(receipt, this.deps, 1);
    return receipt.transactionHash as Hash;
  }

  /**
   * Registers and creates a new token network for the provided token address.
   * Throws an error, if
   * <ol>
   *  <li>Executed on main net</li>
   *  <li>`token` is not a valid address</li>
   *  <li>Token is already registered</li>
   *  <li>Token could not be registered</li>
   * </ol>
   *
   * @param token - Address of the token to be registered
   * @param channelParticipantDepositLimit - The deposit limit per channel participant
   * @param tokenNetworkDepositLimit - The deposit limit of the whole token network
   * @returns Address of new token network
   */
  public async registerToken(
    token: string,
    channelParticipantDepositLimit: BigNumberish = MaxUint256,
    tokenNetworkDepositLimit: BigNumberish = MaxUint256,
  ): Promise<Address> {
    // Check whether address is valid
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);

    // Check whether we are on a test network
    assert(this.deps.network.chainId !== 1, ErrorCodes.RDN_REGISTER_TOKEN_MAINNET, this.log.info);

    const { signer } = chooseOnchainAccount(this.deps, this.config.subkey);
    const tokenNetworkRegistry = getContractWithSigner(this.deps.registryContract, signer);

    // Check whether token is already registered
    await this.monitorToken(token).then(
      (tokenNetwork) => {
        throw new RaidenError(ErrorCodes.RDN_REGISTER_TOKEN_REGISTERED, { tokenNetwork });
      },
      () => undefined,
    );

    const [, receipt] = await lastValueFrom(
      transact(
        tokenNetworkRegistry,
        'createERC20TokenNetwork',
        [token, channelParticipantDepositLimit, tokenNetworkDepositLimit],
        this.deps,
        { error: ErrorCodes.RDN_REGISTER_TOKEN_FAILED },
      ),
    );
    await waitConfirmation(receipt, this.deps);

    return await this.monitorToken(token);
  }

  /**
   * Fetches balance of UserDeposit Contract for SDK's account minus cached spent IOUs
   *
   * @returns Promise to UDC remaining capacity
   */
  public async getUDCCapacity(): Promise<BigNumber> {
    const balance = await getUdcBalance(this.deps.latest$);
    const now = Math.round(Date.now() / 1e3); // in seconds
    const owedAmount = Object.values(this.state.iou)
      .reduce(
        (acc, value) => [
          ...acc,
          ...Object.values(value).filter((value) => value.claimable_until.gte(now)),
        ],
        [] as IOU[],
      )
      .reduce((acc, iou) => acc.add(iou.amount), Zero);
    return balance.sub(owedAmount);
  }

  /**
   * Fetches total_deposit of UserDeposit Contract for SDK's account
   *
   * The usable part of the deposit should be fetched with [[getUDCCapacity]], but this function
   * is useful when trying to deposit based on the absolute value of totalDeposit.
   *
   * @returns Promise to UDC total deposit
   */
  public async getUDCTotalDeposit(): Promise<BigNumber> {
    return firstValueFrom(
      this.deps.latest$.pipe(
        pluck('udcDeposit', 'totalDeposit'),
        filter((deposit) => !!deposit && deposit.lt(MaxUint256)),
      ),
    );
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
   * @returns transaction hash
   */
  public async depositToUDC(
    amount: BigNumberish,
    onChange?: OnChange<EventTypes, { txHash: string }>,
  ): Promise<Hash> {
    const deposit = decode(UInt(32), amount, ErrorCodes.DTA_INVALID_DEPOSIT, this.log.info);
    assert(deposit.gt(Zero), ErrorCodes.DTA_NON_POSITIVE_NUMBER, this.log.info);
    const deposited = await this.deps.userDepositContract.callStatic.total_deposit(this.address);
    const meta = { totalDeposit: deposited.add(deposit) as UInt<32> };

    const mined = asyncActionToPromise(udcDeposit, meta, this.action$, false).then(({ txHash }) =>
      onChange?.({ type: EventTypes.DEPOSITED, payload: { txHash } }),
    );
    this.store.dispatch(udcDeposit.request({ deposit }, meta));

    const confirmed = asyncActionToPromise(udcDeposit, meta, this.action$, true).then(
      ({ txHash }) => {
        onChange?.({ type: EventTypes.CONFIRMED, payload: { txHash } });
        return txHash;
      },
    );

    const [, txHash] = await Promise.all([mined, confirmed]);
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
    { subkey, gasPrice: price }: { subkey?: boolean; gasPrice?: BigNumberish } = {},
  ): Promise<Hash> {
    assert(Address.is(to), [ErrorCodes.DTA_INVALID_ADDRESS, { to }], this.log.info);

    const { signer, address } = chooseOnchainAccount(this.deps, subkey ?? this.config.subkey);

    // we use provider.getGasPrice directly in order to use the old gasPrice for txs, which
    // allows us to predict exactly the final gasPrice and deplet balance
    const gasPrice = price ? BigNumber.from(price) : await this.deps.provider.getGasPrice();

    let curBalance, gasLimit;
    for (let try_ = 0; !curBalance || !gasLimit; try_++) {
      // curBalance may take some tries to be updated right after a tx
      try {
        curBalance = await this.getBalance(address);
        gasLimit = await this.deps.provider.estimateGas({
          from: address,
          to,
          value: curBalance,
        });
      } catch (e) {
        if (try_ >= 5) throw e;
      }
    }

    // transferableBalance is current balance minus the cost of a single transfer as per gasPrice
    const transferableBalance = curBalance.sub(gasPrice.mul(gasLimit));
    assert(
      transferableBalance.gt(Zero),
      [ErrorCodes.RDN_INSUFFICIENT_BALANCE, { transferableBalance }],
      this.log.warn,
    );

    // caps value to transferableBalance, so if it's too big, transfer all
    const amount = transferableBalance.lte(value) ? transferableBalance : BigNumber.from(value);

    const tx = await signer.sendTransaction({ to, value: amount, gasPrice, gasLimit });
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

    const { address } = chooseOnchainAccount(this.deps, subkey ?? this.config.subkey);

    const curBalance = await this.getTokenBalance(token, address);
    // caps value to balance, so if it's too big, transfer all
    const amount = curBalance.lte(value) ? curBalance : BigNumber.from(value);

    const [, receipt] = await lastValueFrom(
      transact(this.deps.getTokenContract(token), 'transfer', [to, amount], this.deps, {
        subkey,
        error: ErrorCodes.RDN_TRANSFER_ONCHAIN_TOKENS_FAILED,
      }).pipe(
        retryWhile(intervalFromConfig(this.deps.config$), {
          maxRetries: 3,
          onErrors: commonTxErrors,
          log: this.log.info,
        }),
      ),
    );
    return receipt.transactionHash as Hash;
  }

  /**
   * Fetches our current UDC withdraw plan
   *
   * @returns Promise to object containing maximum 'amount' planned for withdraw and
   * 'withdrawableAfter' second at which withdraw will become available,
   * and 'ready' after it can be withdrawn with [[withdrawFromUDC]];
   * resolves to undefined if there's no current plan
   */
  public async getUDCWithdrawPlan(): Promise<
    { amount: UInt<32>; withdrawableAfter: number; ready: boolean } | undefined
  > {
    const plan = await this.deps.userDepositContract.withdraw_plans(this.address);
    if (plan.withdrawable_after.isZero()) return;
    return {
      amount: plan.amount as UInt<32>,
      withdrawableAfter: plan.withdrawable_after.toNumber(),
      ready: plan.withdrawable_after.lte(Math.ceil(Date.now() / 1e3)),
    };
  }

  /**
   * Records a UDC withdraw plan for our UDC deposit, capped at whole balance.
   *
   * @param value - Maximum value which we may try to withdraw.
   * @returns Promise to hash of plan transaction, if it succeeds.
   */
  public async planUDCWithdraw(value: BigNumberish = MaxUint256): Promise<Hash> {
    const withdrawable = await getUdcBalance(this.deps.latest$);
    assert(withdrawable.gt(0), 'nothing to withdraw from UDC');
    const amount = withdrawable.lte(value)
      ? withdrawable
      : decode(UInt(32), value, ErrorCodes.DTA_INVALID_AMOUNT, this.log.error);
    const meta = { amount };
    const promise = asyncActionToPromise(udcWithdrawPlan, meta, this.action$, true).then(
      ({ txHash }) => txHash!,
    );
    this.store.dispatch(udcWithdrawPlan.request(undefined, meta));
    return promise;
  }

  /**
   * Complete a planned UDC withdraw and get the deposit to account.
   *
   * Maximum 'value' is the one from current plan, attempting to withdraw a larger value will throw
   * an error, but a smaller value is valid. This method may only be called after plan is 'ready'
   *
   * @param value - Maximum value which we may try to withdraw. An error will be thrown if this
   *    value is larger than [[getUDCCapacity]]+[[getUDCWithdrawPlan]].amount
   * @param options - options object
   * @param options.subkey - if true, force withdrawing to subkey instead of the main account as
   *       beneficiary
   * @returns Promise to hash of plan transaction, if it succeeds.
   */
  public async withdrawFromUDC(
    value?: BigNumberish,
    options?: { subkey?: boolean },
  ): Promise<Hash> {
    assert(!this.config.autoUDCWithdraw, ErrorCodes.UDC_WITHDRAW_AUTO_ENABLED, this.log.warn);
    const plan = await this.getUDCWithdrawPlan();
    assert(plan, ErrorCodes.UDC_WITHDRAW_NO_PLAN, this.log.warn);
    if (!value) {
      value = plan.amount;
    } else {
      assert(plan.amount.gte(value), ErrorCodes.UDC_WITHDRAW_TOO_LARGE, this.log.warn);
    }
    const meta = {
      amount: decode(UInt(32), value, ErrorCodes.DTA_INVALID_AMOUNT, this.log.error),
    };
    // wait for plan to be ready if needed
    if (!plan.ready)
      await new Promise((resolve) =>
        setTimeout(resolve, plan.withdrawableAfter * 1e3 - Date.now()),
      );
    const promise = asyncActionToPromise(udcWithdraw, meta, this.action$, true).then(
      ({ txHash }) => txHash,
    );
    this.store.dispatch(udcWithdraw.request(options, meta));
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
   * config.expiryFactory * config.revealTimeout seconds).
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
    const expiration = Math.ceil(
      Date.now() / 1e3 + this.config.expiryFactor * this.config.revealTimeout,
    );

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
    this.store.dispatch(withdrawResolve(undefined, meta));
    return promise;
  }

  /**
   * Fetches an ordered list of suggested partners from provided, configured or first found PFS
   *
   * @param token - Token address to get partners for
   * @param options - Request options
   * @param options.pfs - PFS to use, instead of configured or automatic
   * @returns Ordered array of suggested partners, with address and scoring values according to PFS
   */
  public async suggestPartners(
    token: string,
    options: { pfs?: RaidenPFS } = {},
  ): Promise<SuggestedPartner[]> {
    assert(Address.is(token), [ErrorCodes.DTA_INVALID_ADDRESS, { token }], this.log.info);
    const tokenNetwork = this.state.tokens[token];
    assert(tokenNetwork, ErrorCodes.RDN_UNKNOWN_TOKEN_NETWORK, this.log.info);
    const pfss = options.pfs ? [decode(PFS, options.pfs)] : await this.findPFS();

    let firstResponse: Error | SuggestedPartner[] | undefined;
    return firstValueFrom(
      from(pfss).pipe(
        concatMap((pfs) =>
          fromFetch(`${pfs.url}/api/v1/${tokenNetwork}/suggest_partner`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }).pipe(
            timeout(this.config.httpTimeout),
            mergeMap(async (response) => response.text()),
            map((text) => {
              const suggestions = decode(SuggestedPartners, jsonParse(text));

              if (!suggestions.length) {
                firstResponse = [];
                throw new Error('PFS returned no suggested partners');
              }
              return suggestions;
            }),
            catchError((err) => {
              // store first error and omit to retry next pfs in list
              this.log.info('Could not fetch PFS suggested partners', pfs, err);
              if (!firstResponse) firstResponse = err;
              return EMPTY;
            }),
          ),
        ),
        first(), // throws if no first result can be fetched/decoded
        // if first errored, throw first seen error or pass current through
        catchError((err) => {
          if (Array.isArray(firstResponse)) {
            return of(firstResponse);
          } else {
            throw firstResponse ?? err;
          }
        }),
      ),
    );
  }

  /**
   * Fetches contract's settleTimeout
   *
   * @returns settleTimeout constant value from contracts
   */
  public get settleTimeout(): number {
    let settleTimeout!: number;
    this.deps.latest$
      .pipe(first())
      .subscribe(({ settleTimeout: lastSettleTimeout }) => (settleTimeout = lastSettleTimeout));
    return settleTimeout;
  }
}

export default Raiden;
