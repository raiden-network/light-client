import { Wallet, Signer, Contract } from 'ethers';
import { AsyncSendable, Web3Provider, JsonRpcProvider } from 'ethers/providers';
import { Network, ParamType, BigNumber, bigNumberify } from 'ethers/utils';
import { Zero } from 'ethers/constants';

import { MatrixClient } from 'matrix-js-sdk';

import { Middleware, applyMiddleware, createStore, Store } from 'redux';
import { createEpicMiddleware } from 'redux-observable';
import { isActionOf } from 'typesafe-actions';
import { createLogger } from 'redux-logger';

import { debounce, findKey, transform, constant, isEmpty } from 'lodash';
import { Observable, Subject, BehaviorSubject, AsyncSubject } from 'rxjs';
import { first, filter, map } from 'rxjs/operators';

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

import {
  ContractsInfo,
  RaidenContracts,
  RaidenEpicDeps,
  RaidenChannels,
  TokenInfo,
} from './types';
import { ShutdownReason } from './constants';
import { Address, PrivateKey, Storage, Hash } from './utils/types';
import {
  RaidenState,
  initialState,
  encodeRaidenState,
  decodeRaidenState,
  raidenEpics,
  raidenReducer,
  RaidenAction,
  RaidenEvents,
  RaidenEvent,
} from './store';
import {
  raidenInit,
  raidenShutdown,
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
  matrixPresenceUpdate,
  matrixRequestMonitorPresenceFailed,
  matrixRequestMonitorPresence,
  messageSend,
} from './store/actions';

export class Raiden {
  private readonly provider: JsonRpcProvider;
  public readonly network: Network;
  private readonly signer: Signer;
  private readonly store: Store<RaidenState, RaidenAction>;
  private contracts: RaidenContracts;
  private readonly tokenInfo: { [token: string]: TokenInfo } = {};

  private readonly action$: Observable<RaidenAction>;
  /**
   * state$ is exposed only so user can listen to state changes and persist them somewhere else,
   * in case they didn't use the Storage overload for the storageOrState argument of `create`.
   * Format/content of the emitted objects are subject to changes and not part of the public API
   */
  public readonly state$: Observable<RaidenState>;
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

  public constructor(
    provider: JsonRpcProvider,
    network: Network,
    signer: Signer,
    contractsInfo: ContractsInfo,
    state: RaidenState,
  ) {
    this.provider = provider;
    this.network = network;
    this.signer = signer;
    const address = state.address;

    this.contracts = {
      registry: new Contract(
        contractsInfo.TokenNetworkRegistry.address,
        TokenNetworkRegistryAbi as ParamType[],
        this.signer,
      ) as TokenNetworkRegistry,
      tokenNetworks: {},
      tokens: {},
    };

    const middlewares: Middleware[] = [];

    if (process.env.NODE_ENV === 'development') {
      middlewares.push(createLogger({ level: 'debug' }));
    }

    const state$ = new BehaviorSubject<RaidenState>(state);
    this.state$ = state$;

    const action$ = new Subject<RaidenAction>();
    this.action$ = action$;

    const matrix$ = new AsyncSubject<MatrixClient>();

    this.channels$ = state$.pipe(
      map(state =>
        transform(
          // transform state.tokenNetworks to token-partner-raidenChannel map
          state.tokenNetworks,
          (result, partner2channel, tokenNetwork) => {
            const token = findKey(state.token2tokenNetwork, tn => tn === tokenNetwork);
            if (!token) return; // shouldn't happen, token mapping is always bi-direction
            result[token] = transform(
              // transform Channel to RaidenChannel, with more info
              partner2channel,
              (partner2raidenChannel, channel, partner) =>
                (partner2raidenChannel[partner] = {
                  token,
                  tokenNetwork,
                  partner,
                  state: channel.state,
                  id: channel.id,
                  settleTimeout: channel.settleTimeout,
                  openBlock: channel.openBlock,
                  closeBlock: channel.closeBlock,
                  ownDeposit: channel.own.deposit,
                  partnerDeposit: channel.partner.deposit,
                  // balance is difference between is partner's and own transfered+locked amounts
                  balance: (channel.partner.balanceProof
                    ? channel.partner.balanceProof.transferredAmount.add(
                        channel.partner.balanceProof.lockedAmount,
                      )
                    : Zero
                  ).sub(
                    channel.own.balanceProof
                      ? channel.own.balanceProof.transferredAmount.add(
                          channel.own.balanceProof.lockedAmount,
                        )
                      : Zero,
                  ),
                }),
            );
          },
        ),
      ),
    );

    this.events$ = action$.pipe(filter(isActionOf(Object.values(RaidenEvents))));

    // minimum blockNumber of contracts deployment as start scan block
    const epicMiddleware = createEpicMiddleware<
      RaidenAction,
      RaidenAction,
      RaidenState,
      RaidenEpicDeps
    >({
      dependencies: {
        stateOutput$: state$,
        actionOutput$: action$,
        matrix$,
        provider,
        network,
        signer,
        address,
        contractsInfo,
        registryContract: this.contracts.registry,
        getTokenNetworkContract: this.getTokenNetworkContract.bind(this),
        getTokenContract: this.getTokenContract.bind(this),
      },
    });

    this.store = createStore(
      raidenReducer,
      state,
      applyMiddleware(...middlewares, epicMiddleware),
    );

    epicMiddleware.run(raidenEpics);
    state = this.store.getState();

    // use next from latest known blockNumber as start block when polling
    this.provider.resetEventsBlock(state.blockNumber + 1);

    this.resolveName = provider.resolveName.bind(provider);

    // initialize epics, this will start monitoring previous token networks and open channels
    this.store.dispatch(raidenInit());
  }

  /**
   * Async helper factory to make a Raiden instance from more common parameters.
   * @param connection
   * - a JsonRpcProvider instance
   * - a Metamask's web3.currentProvider object or
   * - a hostname or remote json-rpc connection string
   * @param account
   * - a string address of an account loaded in provider or
   * - a string private key or
   * - a number index of an account loaded in provider (e.g. 0 for Metamask's loaded account)
   * @param storageOrState
   *   Storage/localStorage-like synchronous object where to load and store current state or
   *   initial RaidenState-like object instead. In this case, user must listen state$ changes
   *   and update them on whichever persistency option is used
   * @param contracts
   *   Contracts deployment info
   * An async factory is needed so we can do the needed async requests to construct the required
   * parameters ahead of construction time, and avoid partial initialization then
   **/
  public static async create(
    connection: JsonRpcProvider | AsyncSendable | string,
    account: Address | PrivateKey | number,
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
    const network = await provider.getNetwork();

    // if no ContractsInfo, try to populate from defaults
    if (!contracts) {
      switch (network.name) {
        case 'rinkeby':
          contracts = rinkebyDeploy.contracts;
          break;
        case 'ropsten':
          contracts = ropstenDeploy.contracts;
          break;
        case 'kovan':
          contracts = kovanDeploy.contracts;
          break;
        case 'goerli':
          contracts = goerliDeploy.contracts;
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
    const address = await signer.getAddress();

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
        `Mismatch between provided account and loaded state: "${address}" !== "${
          loadedState.address
        }"`,
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
    return this.state.address;
  }

  public async getBlockNumber(): Promise<number> {
    return this.provider.blockNumber || (await this.provider.getBlockNumber());
  }

  /**
   * Get ETH balance for given address or self
   * @param address  Optional target address. If omitted, gets own balance
   * @returns  BigNumber of ETH balance
   */
  public getBalance(address?: Address): Promise<BigNumber> {
    return this.provider.getBalance(address || this.address);
  }

  /**
   * Get token balance and token decimals for given address or self
   * @param token  Token address to fetch balance. Must be one of the monitored tokens.
   * @param address  Optional target address. If omitted, gets own balance
   * @returns  BigNumber containing address's token balance
   */
  public async getTokenBalance(token: Address, address?: Address): Promise<BigNumber> {
    if (!(token in this.state.token2tokenNetwork))
      throw new Error(`token "${token}" not monitored`);
    const tokenContract = this.getTokenContract(token);

    return tokenContract.functions.balanceOf(address || this.address);
  }

  /**
   * Get token information: totalSupply, decimals, name and symbol
   * Rejects only if 'token' contract doesn't define totalSupply and decimals methods.
   * name and symbol may be undefined, as they aren't actually part of ERC20 standard, although
   * very common and defined on most token contracts.
   * @param token address to fetch info from
   * @returns TokenInfo
   */
  public async getTokenInfo(token: Address): Promise<TokenInfo> {
    /* tokenInfo isn't in state as it isn't relevant for being preserved, it's merely a cache */
    if (!(token in this.state.token2tokenNetwork))
      throw new Error(`token "${token}" not monitored`);
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
   */
  public async getTokenList(): Promise<Address[]> {
    // here we assume there'll be at least one token registered on a registry
    // so, if the list is empty (e.g. on first init), raidenInitializationEpic is still fetching
    // the TokenNetworkCreated events from registry, so we wait until some token is found
    if (isEmpty(this.state.token2tokenNetwork))
      await this.action$
        .pipe(
          filter(isActionOf(tokenMonitored)),
          first(),
        )
        .toPromise();
    return Object.keys(this.state.token2tokenNetwork);
  }

  /**
   * Create a TokenNetwork contract linked to this.signer for given tokenNetwork address
   * Caches the result and returns the same contract instance again for the same address on this
   * @param address  TokenNetwork contract address (not token address!)
   * @return  TokenNetwork Contract instance
   */
  private getTokenNetworkContract(address: Address): TokenNetwork {
    if (!(address in this.contracts.tokenNetworks))
      this.contracts.tokenNetworks[address] = new Contract(
        address,
        TokenNetworkAbi as ParamType[],
        this.signer,
      ) as TokenNetwork;
    return this.contracts.tokenNetworks[address];
  }

  /**
   * Create a Token contract linked to this.signer for given token address
   * Caches the result and returns the same contract instance again for the same address on this
   * @param address  Token contract address
   * @return  Token Contract instance
   */
  private getTokenContract(address: Address): Token {
    if (!(address in this.contracts.tokens))
      this.contracts.tokens[address] = new Contract(
        address,
        TokenAbi as ParamType[],
        this.signer,
      ) as Token;
    return this.contracts.tokens[address];
  }

  /**
   * Open a channel on the tokenNetwork for given token address with partner
   * @param token  Token address on currently configured token network registry
   * @param partner  Partner address
   * @param settleTimeout  openChannel parameter, defaults to 500
   * @returns  txHash of channelOpen call, iff it succeeded
   */
  public async openChannel(
    token: Address,
    partner: Address,
    settleTimeout: number = 500,
  ): Promise<Hash> {
    const state = this.state;
    const tokenNetwork = state.token2tokenNetwork[token];
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
   * @param token  Token address on currently configured token network registry
   * @param partner  Partner address
   * @param deposit  Number of tokens to deposit on channel
   * @returns  txHash of setTotalDeposit call, iff it succeeded
   */
  public async depositChannel(
    token: Address,
    partner: Address,
    deposit: BigNumber | number,
  ): Promise<Hash> {
    const state = this.state;
    const tokenNetwork = state.token2tokenNetwork[token];
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
   * @param token  Token address on currently configured token network registry
   * @param partner  Partner address
   * @returns  txHash of closeChannel call, iff it succeeded
   */
  public async closeChannel(token: Address, partner: Address): Promise<Hash> {
    const state = this.state;
    const tokenNetwork = state.token2tokenNetwork[token];
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
   * @param token  Token address on currently configured token network registry
   * @param partner  Partner address
   * @returns  txHash of settleChannel call, iff it succeeded
   */
  public async settleChannel(token: Address, partner: Address): Promise<Hash> {
    const state = this.state;
    const tokenNetwork = state.token2tokenNetwork[token];
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
   * @param address checksummed address to be monitored
   * @returns Promise to object describing availability and last event timestamp
   */
  public async getAvailability(
    address: Address,
  ): Promise<{ userId: string; available: boolean; ts: number }> {
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
   * Temporary interface to test MessageSendAction
   */
  public sendMessage(address: Address, message: string): void {
    this.store.dispatch(messageSend({ message }, { address }));
  }
}

export default Raiden;
