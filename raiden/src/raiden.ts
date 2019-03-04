import { Wallet, Signer } from 'ethers';
import { AsyncSendable, Web3Provider, JsonRpcProvider } from 'ethers/providers';
import { Network } from 'ethers/utils';

import { Middleware, applyMiddleware, createStore, Store } from 'redux';
import { createEpicMiddleware } from 'redux-observable';
import { createLogger } from 'redux-logger';

import { debounce } from 'lodash';
import { Observable } from 'rxjs';

import {
  RaidenState,
  initialState,
  RaidenActionTypes,
  newBlock,
  raidenEpic,
  raidenReducer,
} from './store';


export class Raiden {
  private provider: JsonRpcProvider;
  private network: Network;
  private signer: Signer;
  private store: Store<RaidenState, RaidenActionTypes>;
  public state$: Observable<RaidenState>;

  public constructor(
    provider: JsonRpcProvider,
    network: Network,
    signer: Signer,
    address: string,
    storage?: Storage,
  ) {
    this.provider = provider;
    this.network = network;
    this.signer = signer;

    const epicMiddleware = createEpicMiddleware();
    const middlewares: Middleware[] = [epicMiddleware];
    const loadedState: RaidenState = { ...initialState, address };

    if (storage) {
      const ns = `raiden_${network.name || network.chainId}_${address}`;
      Object.assign(
        loadedState,
        JSON.parse(storage.getItem(ns) || 'null'),
      );
      // custom middleware to set storage key=ns with latest state
      const debouncedSetItem = debounce(
        (ns: string, state: RaidenState): void => storage.setItem(ns, JSON.stringify(state)),
        1000,
        { maxWait: 5000, leading: true, trailing: false },
      );
      middlewares.push(store => next => action => {
        const result = next(action);
        debouncedSetItem(ns, store.getState());
        return result;
      });
    }

    if (process.env.NODE_ENV === 'development') {
      middlewares.push(createLogger({ colors: false }));
    }

    this.store = createStore(
      raidenReducer,
      loadedState,
      applyMiddleware(...middlewares),
    );

    this.state$ = new Observable<RaidenState>(observer => {
      observer.next(this.store.getState());
      return this.store.subscribe(() => observer.next(this.store.getState()));
    })

    epicMiddleware.run(raidenEpic);

    // this.state$ = from(this.store);
    this.provider.on('block', this.newBlock.bind(this));

    console.log('polling', this.provider.polling, this.provider.pollingInterval);
  }

  /**
   * Async helper factory to make a Raiden instance from more common parameters.
   * connection:
   * - a Metamask's web3.currentProvider object or
   * - a hostname or remote json-rpc connection string
   * account:
   * - a string address of an account loaded in provider or
   * - a string private key or
   * - a number index of an account loaded in provider (e.g. 0 for Metamask's loaded account)
   * An async factory is needed so we can do the needed async requests to construct the required
   * parameters ahead of construction time, and avoid partial initialization then
   */
  public static async create(
    connection: AsyncSendable | string,
    account: string | number,
    storage?: Storage,
  ): Promise<Raiden> {
    let provider: JsonRpcProvider;
    if (typeof connection === 'string') {
      provider = new JsonRpcProvider(connection);
    } else {
      provider = new Web3Provider(connection);
    }
    const network = await provider.getNetwork();

    let signer: Signer;
    if (typeof account === 'string') {
      if (account.length === 42) {  // address
        const accounts = await provider.listAccounts();
        if (accounts.indexOf(account) < 0)
          throw `Account "${account}" not found in provider, got=${accounts}`;
        signer = provider.getSigner(account);
      } else if (account.length === 66) {  // private key
        signer = new Wallet(account, provider);
      } else {
        throw 'String account must be either a 0x-encoded address or private key';
      }
    } else /* if (typeof account === 'number') */ {  // index of account in provider
      const accounts = await provider.listAccounts();
      if (account >= accounts.length)
        throw `Account index ${account} not found in provider, got=${accounts}`;
      signer = provider.getSigner(accounts[account]);
    }
    const address = await signer.getAddress();

    return new Raiden(provider, network, signer, address, storage);
  }

  public get address(): string {
    return this.store.getState().address;
  }

  public async getBlockNumber(): Promise<number> {
    return this.provider.blockNumber || this.provider.getBlockNumber();
  }

  private newBlock(blockNumber: number): void {
    this.store.dispatch(newBlock(blockNumber));
  }
}

export default Raiden;
