import { Wallet, Signer, Contract } from 'ethers';
import { AsyncSendable, Web3Provider, JsonRpcProvider } from 'ethers/providers';
import { Network } from 'ethers/utils';

import { Middleware, applyMiddleware, createStore, Store } from 'redux';
import { createEpicMiddleware, ofType } from 'redux-observable';
import { createLogger } from 'redux-logger';

import { debounce } from 'lodash';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { first, filter } from 'rxjs/operators';

import { ContractsInfo, RaidenContracts, RaidenEpicDeps } from './types';
import { TokenNetworkRegistry } from './contracts/TokenNetworkRegistry';
import { TokenNetwork } from './contracts/TokenNetwork';

import TokenNetworkRegistryAbi from './abi/TokenNetworkRegistry.json';
import TokenNetworkAbi from './abi/TokenNetwork.json';

import mainnetDeploy from './deployment/deployment_mainnet.json';
import ropstenDeploy from './deployment/deployment_ropsten.json';
import rinkebyDeploy from './deployment/deployment_rinkeby.json';
import kovanDeploy from './deployment/deployment_kovan.json';

import {
  RaidenState,
  initialState,
  RaidenActions,
  RaidenActionType,

  TokenMonitoredAction,
  TokenMonitorActionFailed,
  ChannelOpenedAction,
  ChannelOpenActionFailed,

  channelOpen,
  tokenMonitor,
  raidenEpics,
  raidenReducer,
} from './store';


export class Raiden {
  private readonly provider: JsonRpcProvider;
  private readonly network: Network;
  private readonly signer: Signer;
  private readonly store: Store<RaidenState, RaidenActions>;
  private readonly contractsInfo: ContractsInfo;
  private contracts: RaidenContracts;

  public readonly state$: Observable<RaidenState>;
  public readonly action$: Observable<RaidenActions>;

  public constructor(
    provider: JsonRpcProvider,
    network: Network,
    signer: Signer,
    address: string,
    contractsInfo: ContractsInfo,
    storageOrState?: Storage | RaidenState,
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
    function isRaidenState(storageOrState: Storage | RaidenState): storageOrState is RaidenState {
      return (storageOrState as RaidenState).address !== undefined;
    }

    if (storageOrState && !isRaidenState(storageOrState)) {
      const ns = `raiden_${network.name || network.chainId}_${address}`;
      Object.assign(
        loadedState,
        JSON.parse(storageOrState.getItem(ns) || 'null'),
      );
      // custom middleware to set storage key=ns with latest state
      const debouncedSetItem = debounce(
        (ns: string, state: RaidenState): void =>
          storageOrState.setItem(ns, JSON.stringify(state, undefined, 2)),
        1000,
        { maxWait: 5000 },
      );
      middlewares.push(store => next => action => {
        const result = next(action);
        debouncedSetItem(ns, store.getState());
        return result;
      });
    } else if (storageOrState) {
      loadedState = storageOrState;
    }

    const state$ = new BehaviorSubject<RaidenState>(loadedState);
    this.state$ = state$;

    const action$ = new Subject<RaidenActions>();
    this.action$ = action$;

    if (process.env.NODE_ENV === 'development') {
      middlewares.push(createLogger({ colors: false }));
    }

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
      },
    });

    this.store = createStore(
      raidenReducer,
      loadedState,
      applyMiddleware(...middlewares, epicMiddleware),
    );

    epicMiddleware.run(raidenEpics);
    loadedState = this.store.getState();

    // start listening events flow for all previously monitored tokens
    for (const token in loadedState.token2tokenNetwork) {
      this.monitorToken(token);
    }

    // use next from latest known blockNumber as start block when polling
    this.provider.resetEventsBlock(loadedState.blockNumber + 1);

    console.log('polling', this.provider.polling, this.provider.pollingInterval, this.provider.blockNumber);
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
   * Create a TokenNetwork contract linked to this.provider for given tokenNetwork address
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
   * Open a channel on the tokenNetwork for given token address with partner and deposit tokens
   * @param token  Token address on currently configured token network registry
   * @param partner  Partner address
   * @param deposit  Number of tokens to deposit on channel after it is created
   * @param settleTimeout  openChannel parameter, defaults to 500
   * @returns  txHash of channelOpen call, iff it succeeded
   */
  public async openChannel(
    token: string,
    partner: string,
    deposit: number,
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
    this.store.dispatch(channelOpen(tokenNetwork, partner, deposit, settleTimeout));
    return promise;
  }
}

export default Raiden;
