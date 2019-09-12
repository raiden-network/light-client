import { Wallet, Signer, Contract } from 'ethers';
import { AsyncSendable, Web3Provider, JsonRpcProvider } from 'ethers/providers';
import {
  Network,
  ParamType,
  BigNumber,
  bigNumberify,
  BigNumberish,
  keccak256,
} from 'ethers/utils';
import { Zero } from 'ethers/constants';

import { MatrixClient } from 'matrix-js-sdk';

import { Middleware, applyMiddleware, createStore, Store } from 'redux';
import { createEpicMiddleware } from 'redux-observable';
import { isActionOf } from 'typesafe-actions';
import { createLogger } from 'redux-logger';

import { debounce, findKey, transform, constant, pick, isEmpty } from 'lodash';
import { Observable, Subject, BehaviorSubject, AsyncSubject, from } from 'rxjs';
import { first, filter, map, distinctUntilChanged, scan, concatMap } from 'rxjs/operators';

import { TokenNetworkRegistry } from '../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../contracts/TokenNetwork';
import { Token } from '../contracts/Token';

import TokenNetworkRegistryAbi from './abi/TokenNetworkRegistry.json';
import TokenNetworkAbi from './abi/TokenNetwork.json';
import TokenAbi from './abi/Token.json';

import ropstenDeploy from './deployment/deployment_ropsten.json';
import rinkebyDeploy from './deployment/deployment_rinkeby.json';
import kovanDeploy from './deployment/deployment_kovan.json';
import goerliDeploy from './deployment/deployment_goerli.json';

import { ContractsInfo, RaidenContracts, RaidenEpicDeps, TokenInfo } from './types';
import { ShutdownReason } from './constants';
import { Address, PrivateKey, Secret, Storage, Hash, UInt } from './utils/types';
import { RaidenState, initialState, encodeRaidenState, decodeRaidenState } from './state';
import { RaidenChannels } from './channels/state';
import { SentTransfer, SentTransfers, RaidenSentTransfer } from './transfers/state';
import { raidenReducer } from './reducer';
import { raidenRootEpic } from './epics';
import { RaidenAction, RaidenEvents, RaidenEvent, raidenShutdown } from './actions';
import {
  tokenMonitored,
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
import { makeSecret, raidenSentTransfer } from './transfers/utils';
import { patchSignSend } from './utils/ethers';

export class Raiden {
  private readonly store: Store<RaidenState, RaidenAction>;
  private readonly deps: RaidenEpicDeps;
  private readonly contracts: RaidenContracts;
  private readonly tokenInfo: { [token: string]: TokenInfo } = {};

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
   * Expose ether's Provider.resolveName for ENS support
   */
  public readonly resolveName: (name: string) => Promise<Address>;

  /**
   * Observable of completed and pending transfers
   * Every time a transfer state is updated, it's emitted here. 'secrethash' property is unique and
   * may be used as identifier to know which transfer got updated.
   */
  public readonly transfers$: Observable<RaidenSentTransfer>;

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

    this.contracts = {
      registry: new Contract(
        contractsInfo.TokenNetworkRegistry.address,
        TokenNetworkRegistryAbi as ParamType[],
        signer,
      ) as TokenNetworkRegistry,
      tokenNetworks: {},
      tokens: {},
    };

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
                const partnerTotal = channel.partner.balanceProof
                    ? channel.partner.balanceProof.transferredAmount.add(
                        channel.partner.balanceProof.lockedAmount,
                      )
                    : Zero,
                  ownTotal = channel.own.balanceProof
                    ? channel.own.balanceProof.transferredAmount.add(
                        channel.own.balanceProof.lockedAmount,
                      )
                    : Zero,
                  balance = partnerTotal.sub(ownTotal);
                partner2raidenChannel[partner] = {
                  state: channel.state,
                  ...pick(channel, ['id', 'settleTimeout', 'openBlock', 'closeBlock']),
                  token,
                  tokenNetwork: tokenNetwork as Address,
                  partner: partner as Address,
                  ownDeposit: channel.own.deposit,
                  partnerDeposit: channel.partner.deposit,
                  balance,
                  capacity: channel.own.deposit.add(balance),
                };
              },
            );
          },
        ),
      ),
    );

    this.transfers$ = state$.pipe(
      map(state => state.sent),
      distinctUntilChanged(),
      concatMap(sent => from(Object.entries(sent))),
      /* this scan stores a reference to each [key,value] in 'acc', and emit as 'changed' iff it
       * changes from last time seen. It relies on value references changing only if needed */
      scan<[string, SentTransfer], { acc: SentTransfers; changed?: SentTransfer }>(
        ({ acc }, [secrethash, sent]) => {
          // if ref didn't change, emit previous accumulator, without 'changed' value
          if (acc[secrethash] === sent) return { acc };
          // else, update ref in 'acc' and emit value in 'changed' prop
          else return { acc: { ...acc, [secrethash]: sent }, changed: sent };
        },
        { acc: {} },
      ),
      filter(({ changed }) => !!changed), // filter out if reference didn't change from last emit
      map(({ changed }) => changed!), // get the changed object only
      // from here, we get SentTransfer objects which changed from previous state (all on first)
      map(raidenSentTransfer),
    );

    this.events$ = action$.pipe(filter(isActionOf(Object.values(RaidenEvents))));

    const middlewares: Middleware[] = [];

    if (process.env.NODE_ENV === 'development') {
      middlewares.push(createLogger({ level: 'debug' }));
    }

    this.deps = {
      stateOutput$: state$,
      actionOutput$: action$,
      matrix$: new AsyncSubject<MatrixClient>(),
      provider,
      network,
      signer,
      address,
      contractsInfo,
      registryContract: this.contracts.registry,
      getTokenNetworkContract: this.getTokenNetworkContract.bind(this),
      getTokenContract: this.getTokenContract.bind(this),
    };
    // minimum blockNumber of contracts deployment as start scan block
    const epicMiddleware = createEpicMiddleware<
      RaidenAction,
      RaidenAction,
      RaidenState,
      RaidenEpicDeps
    >({ dependencies: this.deps });

    this.store = createStore(
      raidenReducer,
      state,
      applyMiddleware(...middlewares, epicMiddleware),
    );

    epicMiddleware.run(raidenRootEpic);
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
   *       <li>string address of an account loaded in provider or</li>
   *       <li>string private key or</li>
   *       <li>number index of an account loaded in provider (e.g. 0 for Metamask's loaded account)</li>
   *     </ul>
   * @param storageOrState - Storage/localStorage-like synchronous object where to load and store
   *     current state or initial RaidenState-like object instead. In this case, user must listen
   *     state$ changes and update them on whichever persistency option is used
   * @param contracts - Contracts deployment info
   * @returns Promise to Raiden SDK client instance
   **/
  public static async create(
    connection: JsonRpcProvider | AsyncSendable | string,
    account: string | number,
    storageOrState?: Storage | RaidenState | unknown,
    contracts?: ContractsInfo,
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
          contracts = (rinkebyDeploy.contracts as unknown) as ContractsInfo;
          break;
        case 'ropsten':
          contracts = (ropstenDeploy.contracts as unknown) as ContractsInfo;
          break;
        case 'kovan':
          contracts = (kovanDeploy.contracts as unknown) as ContractsInfo;
          break;
        case 'goerli':
          contracts = (goerliDeploy.contracts as unknown) as ContractsInfo;
          break;
        default:
          throw new Error(
            `No deploy info provided nor recognized network: ${JSON.stringify(network)}`,
          );
      }
    }

    let signer: Signer;
    if (typeof account === 'number') {
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

    // use TokenNetworkRegistry deployment block as initial blockNumber, or 0
    let loadedState: RaidenState = {
      ...initialState,
      blockNumber: contracts.TokenNetworkRegistry.block_number || 0,
      address,
    };

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
      const loaded = Object.assign(
        {},
        loadedState,
        JSON.parse((await storageOrState.getItem(ns)) || 'null'),
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

    const raiden = new Raiden(provider, network, signer, contracts, loadedState);
    if (onState) raiden.state$.subscribe(onState, onStateComplete, onStateComplete);
    return raiden;
  }

  /**
   * Triggers all epics to be unsubscribed
   */
  public stop(): void {
    this.store.dispatch(raidenShutdown({ reason: ShutdownReason.STOP }));
  }

  private get state(): RaidenState {
    return this.store.getState();
  }

  public get address(): Address {
    return this.deps.address;
  }

  public get network(): Network {
    return this.deps.network;
  }

  public async getBlockNumber(): Promise<number> {
    return this.deps.provider.blockNumber || (await this.deps.provider.getBlockNumber());
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
    const tokenContract = this.getTokenContract(token);

    return tokenContract.functions.balanceOf(address);
  }

  /**
   * Get token information: totalSupply, decimals, name and symbol
   * Rejects only if 'token' contract doesn't define totalSupply and decimals methods.
   * name and symbol may be undefined, as they aren't actually part of ERC20 standard, although
   * very common and defined on most token contracts.
   *
   * @param token - address to fetch info from
   * @returns TokenInfo
   */
  public async getTokenInfo(token: string): Promise<TokenInfo> {
    if (!Address.is(token)) throw new Error('Invalid address');
    /* tokenInfo isn't in state as it isn't relevant for being preserved, it's merely a cache */
    if (!(token in this.state.tokens)) throw new Error(`token "${token}" not monitored`);
    if (!(token in this.tokenInfo)) {
      const tokenContract = this.getTokenContract(token);
      const [totalSupply, decimals, name, symbol] = await Promise.all([
        tokenContract.functions.totalSupply(),
        tokenContract.functions.decimals(),
        tokenContract.functions.name().catch(constant(undefined)),
        tokenContract.functions.symbol().catch(constant(undefined)),
      ]);
      this.tokenInfo[token] = { totalSupply, decimals, name, symbol };
    }
    return this.tokenInfo[token];
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
    if (isEmpty(this.state.tokens))
      await this.action$
        .pipe(
          filter(isActionOf(tokenMonitored)),
          first(),
        )
        .toPromise();
    return Object.keys(this.state.tokens) as Address[];
  }

  /**
   * Create a TokenNetwork contract linked to this.deps.signer for given tokenNetwork address
   * Caches the result and returns the same contract instance again for the same address on this
   *
   * @param address - TokenNetwork contract address (not token address!)
   * @returns TokenNetwork Contract instance
   */
  private getTokenNetworkContract(address: Address): TokenNetwork {
    if (!(address in this.contracts.tokenNetworks))
      this.contracts.tokenNetworks[address] = new Contract(
        address,
        TokenNetworkAbi as ParamType[],
        this.deps.signer,
      ) as TokenNetwork;
    return this.contracts.tokenNetworks[address];
  }

  /**
   * Create a Token contract linked to this.deps.signer for given token address
   * Caches the result and returns the same contract instance again for the same address on this
   *
   * @param address - Token contract address
   * @returns Token Contract instance
   */
  private getTokenContract(address: Address): Token {
    if (!(address in this.contracts.tokens))
      this.contracts.tokens[address] = new Contract(
        address,
        TokenAbi as ParamType[],
        this.deps.signer,
      ) as Token;
    return this.contracts.tokens[address];
  }

  /**
   * Open a channel on the tokenNetwork for given token address with partner
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @param settleTimeout - openChannel parameter, defaults to 500
   * @returns txHash of channelOpen call, iff it succeeded
   */
  public async openChannel(
    token: string,
    partner: string,
    settleTimeout: number = 500,
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
    this.store.dispatch(channelOpen({ settleTimeout }, { tokenNetwork, partner }));
    return promise;
  }

  /**
   * Deposit tokens on channel between us and partner on tokenNetwork for token
   *
   * @param token - Token address on currently configured token network registry
   * @param partner - Partner address
   * @param deposit - Number of tokens to deposit on channel
   * @returns txHash of setTotalDeposit call, iff it succeeded
   */
  public async depositChannel(
    token: string,
    partner: string,
    deposit: BigNumberish,
  ): Promise<Hash> {
    if (!Address.is(token) || !Address.is(partner)) throw new Error('Invalid address');
    const state = this.state;
    const tokenNetwork = state.tokens[token];
    if (!tokenNetwork) throw new Error('Unknown token network');
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
    this.store.dispatch(
      channelDeposit({ deposit: bigNumberify(deposit) }, { tokenNetwork, partner }),
    );
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
   * @param amount - Amount to try to transfer
   * @param opts - Optional parameters for transfer:
   *                - paymentId  payment identifier, a random one will be generated if missing
   *                - secret  Secret to register, a random one will be generated if missing
   *                - secrethash  Must match secret, if both provided, or else, secret must be
   *                              informed to target by other means, and reveal can't be performed
   * @returns A promise to transfer's secrethash (unique id) when it's accepted
   */
  public async transfer(
    token: string,
    target: string,
    amount: BigNumberish,
    opts?: { paymentId?: BigNumberish; secret?: string; secrethash?: string },
  ): Promise<Hash> {
    if (!Address.is(token) || !Address.is(target)) throw new Error('Invalid address');
    const tokenNetwork = this.state.tokens[token];
    if (!tokenNetwork) throw new Error('Unknown token network');

    amount = bigNumberify(amount);
    if (!UInt(32).is(amount)) throw new Error('Invalid amount');

    let paymentId = !opts || !opts.paymentId ? undefined : bigNumberify(opts.paymentId);
    if (paymentId && !UInt(8).is(paymentId)) throw new Error('Invalid opts.paymentId');

    let secret: Secret | undefined, secrethash: Hash | undefined;
    if (opts) {
      const _secret = opts.secret;
      if (_secret !== undefined && !Secret.is(_secret)) throw new Error('Invalid opts.secret');
      const _secrethash = opts.secrethash;
      if (_secrethash !== undefined && !Hash.is(_secrethash))
        throw new Error('Invalid opts.secrethash');
      secret = _secret;
      secrethash = _secrethash;
    }
    if (!secrethash) {
      if (!secret) secret = makeSecret();
      secrethash = keccak256(secret) as Hash;
    } else if (secret && keccak256(secret) !== secrethash) {
      throw new Error('Secret and secrethash must match if passing both');
    }

    const promise = this.action$
      .pipe(
        filter(isActionOf([transferSigned, transferFailed])),
        filter(action => action.meta.secrethash === secrethash!),
        first(),
        map(action => {
          if (isActionOf(transferFailed, action)) throw action.payload;
          return secrethash!;
        }),
      )
      .toPromise();

    this.store.dispatch(
      transfer({ tokenNetwork, target, amount, paymentId, secret }, { secrethash }),
    );
    return promise;
  }
}

export default Raiden;
