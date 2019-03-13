import { Wallet, Signer, Contract } from 'ethers';
import { AsyncSendable, Web3Provider, JsonRpcProvider } from 'ethers/providers';
import { Network } from 'ethers/utils';

import { Middleware, applyMiddleware, createStore, Store } from 'redux';
import { createEpicMiddleware, ofType } from 'redux-observable';
import { createLogger } from 'redux-logger';

import { debounce, findKey, transform } from 'lodash';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { first, filter, map } from 'rxjs/operators';

import { TokenNetworkRegistry } from '../contracts/TokenNetworkRegistry';
import { TokenNetwork } from '../contracts/TokenNetwork';
import { Token } from '../contracts/Token';

import TokenNetworkRegistryAbi from './abi/TokenNetworkRegistry.json';
import TokenNetworkAbi from './abi/TokenNetwork.json';
import TokenAbi from './abi/Token.json';

import mainnetDeploy from './deployment/deployment_mainnet.json';
import ropstenDeploy from './deployment/deployment_ropsten.json';
import rinkebyDeploy from './deployment/deployment_rinkeby.json';
import kovanDeploy from './deployment/deployment_kovan.json';

import { ContractsInfo, RaidenContracts, RaidenEpicDeps, RaidenChannels } from './types';
import {
  RaidenState,
  RaidenStateType,
  initialState,
  encodeRaidenState,
  decodeRaidenState,

  raidenEpics,
  raidenReducer,
  RaidenActions,
  RaidenActionType,

  TokenMonitoredAction,
  TokenMonitorActionFailed,
  ChannelOpenedAction,
  ChannelOpenActionFailed,
  ChannelDepositedAction,
  ChannelDepositActionFailed,

  raidenInit,
  tokenMonitor,
  channelOpen,
  channelDeposit,
} from './store';
import { BigNumber, bigNumberify } from './store/types';


export class Raiden {
  private readonly provider: JsonRpcProvider;
  private readonly network: Network;
  private readonly signer: Signer;
  private readonly store: Store<RaidenState, RaidenActions>;
  private readonly contractsInfo: ContractsInfo;
  private contracts: RaidenContracts;

  private readonly action$: Observable<RaidenActions>;
  public readonly state$: Observable<RaidenState>;
  public readonly channels$: Observable<RaidenChannels>;

  public constructor(
    provider: JsonRpcProvider,
    network: Network,
    signer: Signer,
    address: string,
    contractsInfo: ContractsInfo,
    storageOrState?: Storage | RaidenState | unknown,
  ) {
    this.provider = provider;
    this.network = network;
    this.signer = signer;

    this.contractsInfo = contractsInfo;
    this.contracts = {
      registry: new Contract(
        contractsInfo.TokenNetworkRegistry.address,
        TokenNetworkRegistryAbi,
        this.signer,
      ) as TokenNetworkRegistry,
      tokenNetworks: {},
      tokens: {},
    }

    const middlewares: Middleware[] = [];
    // use TokenNetworkRegistry deployment block as initial blockNumber, or 0
    let loadedState: RaidenState = {
      ...initialState,
      blockNumber: contractsInfo.TokenNetworkRegistry.block_number || 0,
      address,
    };

    // type guard
    function isStorage(storageOrState: unknown): storageOrState is Storage {
      return storageOrState && typeof (storageOrState as Storage).getItem === 'function';
    }

    if (storageOrState && isStorage(storageOrState)) {
      const ns = `raiden_${network.name || network.chainId}_${address}`;
      const loaded = Object.assign(
        {},
        loadedState,
        JSON.parse(storageOrState.getItem(ns) || 'null'),
      );

      loadedState = decodeRaidenState(loaded);

      // custom middleware to set storage key=ns with latest state
      const debouncedSetItem = debounce(
        (ns: string, state: RaidenState): void =>
          storageOrState.setItem(ns, encodeRaidenState(state)),
        1000,
        { maxWait: 5000 },
      );
      middlewares.push(store => next => action => {
        const result = next(action);
        debouncedSetItem(ns, store.getState());
        return result;
      });
    } else if (storageOrState && RaidenStateType.is(storageOrState)) {
      loadedState = storageOrState;
    } else if (storageOrState /* type(storageOrState) === unknown */) {
      loadedState = decodeRaidenState(storageOrState);
    }

    if (process.env.NODE_ENV === 'development') {
      middlewares.push(createLogger({ colors: false }));
    }

    const state$ = new BehaviorSubject<RaidenState>(loadedState);
    this.state$ = state$;

    const action$ = new Subject<RaidenActions>();
    this.action$ = action$;

    this.channels$ = state$.pipe(
      map(state => transform(  // transform state.tokenNetworks to token-partner-raidenChannel map
        state.tokenNetworks,
        (result, partner2channel, tokenNetwork) => {
          const token = findKey(state.token2tokenNetwork, tn => tn === tokenNetwork);
          if (!token) return;  // shouldn't happen, token mapping is always bi-direction
          result[token] = transform(  // transform Channel to RaidenChannel, with more info
            partner2channel,
            (partner2raidenChannel, channel, partner) =>
              partner2raidenChannel[partner] = { ...channel, token, tokenNetwork, partner }
          )
        }
      )),
    )

    // minimum blockNumber of contracts deployment as start scan block
    const epicMiddleware = createEpicMiddleware<
      RaidenActions,
      RaidenActions,
      RaidenState,
      RaidenEpicDeps
    >({
      dependencies: {
        stateOutput$: state$,
        actionOutput$: action$,
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
      loadedState,
      applyMiddleware(...middlewares, epicMiddleware),
    );

    epicMiddleware.run(raidenEpics);
    loadedState = this.store.getState();

    // use next from latest known blockNumber as start block when polling
    this.provider.resetEventsBlock(loadedState.blockNumber + 1);

    // initialize epics, this will start monitoring previous token networks and open channels
    this.store.dispatch(raidenInit());

    console.log(
      'polling',
      this.provider.polling,
      this.provider.pollingInterval,
      this.provider.blockNumber,
    );
  }

  /**
   * Async helper factory to make a Raiden instance from more common parameters.
   * @param connection
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
    connection: AsyncSendable | string,
    account: string | number,
    storageOrState?: Storage | RaidenState,
    contracts?: ContractsInfo,
  ): Promise<Raiden> {
    let provider: JsonRpcProvider;
    if (typeof connection === 'string') {
      provider = new JsonRpcProvider(connection);
    } else {
      provider = new Web3Provider(connection);
    }
    const network = await provider.getNetwork();

    // if no ContractsInfo, try to populate from defaults
    if (!contracts) {
      switch (network.name) {
        case 'homestead':
          contracts = mainnetDeploy.contracts;
          break;
        case 'rinkeby':
          contracts = rinkebyDeploy.contracts;
          break;
        case 'ropsten':
          contracts = ropstenDeploy.contracts;
          break;
        case 'kovan':
          contracts = kovanDeploy.contracts;
          break;
        default:
          throw new Error('No contracts deploy info provided nor recognized network');
      }
    }

    let signer: Signer;
    if (typeof account === 'string') {
      if (account.length === 42) {  // address
        const accounts = await provider.listAccounts();
        if (accounts.indexOf(account) < 0)
          throw new Error(`Account "${account}" not found in provider, got=${accounts}`);
        signer = provider.getSigner(account);
      } else if (account.length === 66) {  // private key
        signer = new Wallet(account, provider);
      } else {
        throw new Error('String account must be either a 0x-encoded address or private key');
      }
    } else /* if (typeof account === 'number') */ {  // index of account in provider
      signer = provider.getSigner(account);
    }
    const address = await signer.getAddress();

    return new Raiden(provider, network, signer, address, contracts, storageOrState);
  }

  private get state(): RaidenState {
    return this.store.getState();
  }

  public get address(): string {
    return this.state.address;
  }

  public async getBlockNumber(): Promise<number> {
    return this.provider.blockNumber || await this.provider.getBlockNumber();
  }

  /**
   * Get ETH balance for given address or self
   * @param address  Optional target address. If omitted, gets own balance
   * @returns  BigNumber of ETH balance
   */
  public getBalance(address?: string): Promise<BigNumber> {
    return this.provider.getBalance(address || this.address);
  }

  /**
   * Get token balance and token decimals for given address or self
   * @param token  Token address to fetch balance. Must be one of the monitored tokens.
   * @param address  Optional target address. If omitted, gets own balance
   * @returns  Object containing properties 'balance' in wei as BigNumber and 'decimals' as number
   */
  public async getTokenBalance(
    token: string,
    address?: string,
  ): Promise<{ balance: BigNumber, decimals: number }> {
    if (!(token in this.state.token2tokenNetwork))
      throw new Error(`token "${token}" not monitored`);
    const tokenContract = this.getTokenContract(token);

    async function getDecimals(): Promise<number> {
      try {
        let decimals = bigNumberify(await tokenContract.functions.decimals());
        if (!decimals) throw 'no decimals';
        return decimals.toNumber();
      } catch (err) {
        return 18;
      }
    }
    const [ balance, decimals ] = await Promise.all([
      tokenContract.functions.balanceOf(address || this.address),
      getDecimals(),
      ,
    ]);
    return { balance, decimals };
  }

  /**
   * Create a TokenNetwork contract linked to this.signer for given tokenNetwork address
   * Caches the result and returns the same contract instance again for the same address on this
   * @param address  TokenNetwork contract address (not token address!)
   * @return  TokenNetwork Contract instance
   */
  private getTokenNetworkContract(address: string): TokenNetwork {
    if (!(address in this.contracts.tokenNetworks))
      this.contracts.tokenNetworks[address] = new Contract(
        address, TokenNetworkAbi, this.signer,
      ) as TokenNetwork;
    return this.contracts.tokenNetworks[address];
  }

  /**
   * Create a Token contract linked to this.signer for given token address
   * Caches the result and returns the same contract instance again for the same address on this
   * @param address  Token contract address
   * @return  Token Contract instance
   */
  private getTokenContract(address: string): Token {
    if (!(address in this.contracts.tokens))
      this.contracts.tokens[address] = new Contract(
        address, TokenAbi, this.signer,
      ) as Token;
    return this.contracts.tokens[address];
  }

  /**
   * A TokenMonitorAction request is one with only 'token' property set
   * This request will ensure token goes into state.token2tokenNetwork mapping
   * and we register listeners for events on this tokenNetwork, if there's a valid tokenNetwork
   * for given token, or fail otherwise.
   * In any case, it'll finally reply with either TokenMonitoredAction or TokenMonitorActionFailed
   * @param address  Token address
   * @return  Promise<string> to tokenNetwork contract address
   */
  public monitorToken(address: string): Promise<string> {
    const promise: Promise<string> = new Promise((resolve, reject) =>
      // wait for the corresponding success or error TokenMonitorAction
      this.action$.pipe(
        ofType<RaidenActions, TokenMonitoredAction | TokenMonitorActionFailed>(
          RaidenActionType.TOKEN_MONITORED,
          RaidenActionType.TOKEN_MONITOR_FAILED,
        ),
        filter(action => action.token === address),
        first(),
      ).subscribe(action =>
        action.tokenNetwork ? resolve(action.tokenNetwork) : reject(action.error)
      )
    );
    this.store.dispatch(tokenMonitor(address));
    return promise;
  }

  /**
   * Open a channel on the tokenNetwork for given token address with partner
   * @param token  Token address on currently configured token network registry
   * @param partner  Partner address
   * @param settleTimeout  openChannel parameter, defaults to 500
   * @returns  txHash of channelOpen call, iff it succeeded
   */
  public async openChannel(
    token: string,
    partner: string,
    settleTimeout: number = 500,
  ): Promise<string> {
    const state = this.state;
    const tokenNetwork = (token in state.token2tokenNetwork)
      ? state.token2tokenNetwork[token]
      : await this.monitorToken(token);
    const promise: Promise<string> = new Promise((resolve, reject) =>
      // wait for the corresponding success or error TokenMonitorAction
      this.action$.pipe(
        ofType<RaidenActions, ChannelOpenedAction | ChannelOpenActionFailed>(
          RaidenActionType.CHANNEL_OPENED,
          RaidenActionType.CHANNEL_OPEN_FAILED,
        ),
        filter(action => action.tokenNetwork === tokenNetwork && action.partner === partner),
        first(),
      ).subscribe(action =>
        action.txHash ? resolve(action.txHash) : reject(action.error)
      )
    );
    this.store.dispatch(channelOpen(tokenNetwork, partner, settleTimeout));
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
    token: string,
    partner: string,
    deposit: BigNumber | number,
  ): Promise<string> {
    const state = this.state;
    const tokenNetwork = (token in state.token2tokenNetwork)
      ? state.token2tokenNetwork[token]
      : await this.monitorToken(token);
    const promise: Promise<string> = new Promise((resolve, reject) =>
      // wait for the corresponding success or error TokenMonitorAction
      this.action$.pipe(
        ofType<RaidenActions, ChannelDepositedAction | ChannelDepositActionFailed>(
          RaidenActionType.CHANNEL_DEPOSITED,
          RaidenActionType.CHANNEL_DEPOSIT_FAILED,
        ),
        filter(action => action.tokenNetwork === tokenNetwork && action.partner === partner),
        first(),
      ).subscribe(action =>
        action.txHash ? resolve(action.txHash) : reject(action.error)
      )
    );
    this.store.dispatch(channelDeposit(tokenNetwork, partner, bigNumberify(deposit)));
    return promise;
  }
}

export default Raiden;
