import { Raiden, RaidenSentTransfer, RaidenPaths, RaidenPFS } from 'raiden-ts';
import { Store } from 'vuex';
import { RootState } from '@/types';
import { Web3Provider } from '@/services/web3-provider';
import { BalanceUtils } from '@/utils/balance-utils';
import { DeniedReason, Progress, Token, TokenModel } from '@/model/types';
import { BigNumber, BigNumberish } from 'ethers/utils';
import { Zero } from 'ethers/constants';
import { exhaustMap, filter, first } from 'rxjs/operators';
import asyncPool from 'tiny-async-pool';
import { ConfigProvider } from './config-provider';

export default class RaidenService {
  private _raiden?: Raiden;
  private store: Store<RootState>;
  private _userDepositTokenAddress: string = '';

  private static async createRaiden(
    provider: any,
    account: string | number = 0
  ): Promise<Raiden> {
    try {
      return await Raiden.create(
        provider,
        account,
        window.localStorage,
        undefined,
        { pfsSafetyMargin: 1.1 }
      );
    } catch (e) {
      throw new RaidenInitializationFailed(e);
    }
  }

  private get raiden(): Raiden {
    if (this._raiden === undefined) {
      throw new Error('Raiden instance was not initialized');
    } else {
      return this._raiden;
    }
  }

  constructor(store: Store<RootState>) {
    this._raiden = undefined;
    this.store = store;
  }

  get userDepositTokenAddress(): string {
    if (!this._userDepositTokenAddress) throw new Error('address empty');
    return this._userDepositTokenAddress;
  }

  async ensResolve(name: string): Promise<string> {
    try {
      const address = await this.raiden.resolveName(name);
      await this.raiden.getAvailability(address);
      return address;
    } catch (e) {
      throw new EnsResolveFailed(e);
    }
  }

  async connect() {
    try {
      const raidenPackageConfigUrl = process.env.VUE_APP_RAIDEN_PACKAGE;
      let config;
      let provider;
      let raiden;

      if (raidenPackageConfigUrl) {
        config = await ConfigProvider.fetch(raidenPackageConfigUrl);
        provider = await Web3Provider.provider(config);
      } else {
        provider = await Web3Provider.provider();
      }

      if (!provider) {
        this.store.commit('noProvider');
      } else {
        if (config) {
          raiden = await RaidenService.createRaiden(
            provider,
            config.PRIVATE_KEY
          );
        } else {
          raiden = await RaidenService.createRaiden(provider);
        }

        this._raiden = raiden;

        this.store.commit('account', await this.getAccount());
        this.store.commit('balance', await this.getBalance());

        this._userDepositTokenAddress = await raiden.userDepositTokenAddress();

        // update connected tokens data on each newBlock
        raiden.events$
          .pipe(
            filter(value => value.type === 'newBlock'),
            exhaustMap(() =>
              this.fetchTokenData(
                this.store.getters.tokens.map((m: TokenModel) => m.address)
              )
            )
          )
          .subscribe();

        raiden.events$
          .pipe(filter(value => value.type === 'raidenShutdown'))
          .subscribe(() => this.store.commit('reset'));

        raiden.events$.subscribe(value => {
          if (value.type === 'tokenMonitored') {
            this.store.commit('updateTokens', {
              [value.payload.token]: { address: value.payload.token }
            });
          }

          // Update presences on matrix presence updates
          if (value.type === 'matrix/presence/success') {
            this.store.commit('updatePresence', {
              [value.meta.address]: value.payload.available
            });
          }
        });

        raiden.channels$.subscribe(value => {
          this.store.commit('updateChannels', value);
        });

        // Subscribe to our pending transfers
        raiden.transfers$.subscribe(async (transfer: RaidenSentTransfer) => {
          const accountAddress = await this.getAccount();
          if (transfer.initiator === accountAddress) {
            this.store.commit('updateTransfers', transfer);
          }
        });

        this.store.commit('network', raiden.network);

        raiden.start();
      }
    } catch (e) {
      let deniedReason: DeniedReason;
      if (e.message && e.message.indexOf('No deploy info provided') > -1) {
        deniedReason = DeniedReason.UNSUPPORTED_NETWORK;
      } else if (e instanceof RaidenInitializationFailed) {
        deniedReason = DeniedReason.INITIALIZATION_FAILED;
      } else {
        deniedReason = DeniedReason.NO_ACCOUNT;
      }
      this.store.commit('accessDenied', deniedReason);
    }

    this.store.commit('loadComplete');
  }
  disconnect() {
    this.raiden.stop();
  }

  async getAccount(): Promise<string> {
    return this.raiden.address;
  }

  async getBalance(): Promise<string> {
    const balance = await this.raiden.getBalance();
    return BalanceUtils.toEth(balance);
  }

  private async getToken(tokenAddress: string): Promise<Token | null> {
    const raiden = this.raiden;
    try {
      const [balance, { decimals, symbol, name }] = await Promise.all([
        raiden.getTokenBalance(tokenAddress),
        raiden.getTokenInfo(tokenAddress)
      ]);
      return {
        name: name,
        symbol: symbol,
        balance: balance,
        decimals: decimals,
        address: tokenAddress
      };
    } catch (e) {
      return null;
    }
  }

  async openChannel(
    token: string,
    partner: string,
    amount: BigNumber,
    progress?: (progress: Progress) => void
  ): Promise<void> {
    const progressUpdater = (current: number, total: number) => {
      if (progress) {
        progress({
          current,
          total
        });
      }
    };

    const raiden = this.raiden;
    progressUpdater(1, 3);

    try {
      await raiden.openChannel(token, partner);
    } catch (e) {
      throw new ChannelOpenFailed(e);
    }

    progressUpdater(2, 3);

    if (amount.gt(Zero)) {
      await this.deposit(token, partner, amount);
    }
  }

  async closeChannel(token: string, partner: string) {
    try {
      await this.raiden.closeChannel(token, partner);
    } catch (e) {
      throw new ChannelCloseFailed(e);
    }
  }

  async deposit(token: string, partner: string, amount: BigNumber) {
    try {
      await this.raiden.depositChannel(token, partner, amount);
    } catch (e) {
      throw new ChannelDepositFailed(e);
    }
  }

  async settleChannel(token: string, partner: string) {
    try {
      await this.raiden.settleChannel(token, partner);
    } catch (e) {
      throw new ChannelSettleFailed(e);
    }
  }

  async fetchTokenData(tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    const fetchToken = async (address: string): Promise<void> =>
      this.getToken(address).then(token => {
        if (!token) return;
        this.store.commit('updateTokens', { [token.address]: token });
      });

    await asyncPool(6, tokens, fetchToken);
  }

  async transfer(
    token: string,
    target: string,
    amount: BigNumber,
    paths: RaidenPaths
  ) {
    try {
      const secretHash = await this.raiden.transfer(token, target, amount, {
        paths: paths
      });

      // Wait for transaction to be completed
      await this.raiden.transfers$
        .pipe(
          first(
            (transfer: RaidenSentTransfer) =>
              transfer.secrethash === secretHash && transfer.completed
          )
        )
        .toPromise();
    } catch (e) {
      throw new TransferFailed(e);
    }
  }

  async findRoutes(
    token: string,
    target: string,
    amount: BigNumber,
    raidenPFS?: RaidenPFS
  ): Promise<RaidenPaths> {
    let routes: RaidenPaths;

    try {
      await this.raiden.getAvailability(target);
      routes = await this.raiden.findRoutes(token, target, amount, {
        pfs: raidenPFS
      });
    } catch (e) {
      throw new FindRoutesFailed(e);
    }

    return routes;
  }

  async fetchServices(): Promise<RaidenPFS[]> {
    let raidenPFS: RaidenPFS[];
    try {
      raidenPFS = await this.raiden.findPFS();
    } catch (e) {
      throw new PFSRequestFailed(e);
    }

    return raidenPFS;
  }

  /* istanbul ignore next */
  async directRoute(
    token: string,
    target: string,
    value: BigNumberish
  ): Promise<RaidenPaths | undefined> {
    return await this.raiden.directRoute(token, target, value);
  }

  /* istanbul ignore next */
  async mint(token: string, amount: BigNumber): Promise<string> {
    return await this.raiden.mint(token, amount);
  }

  /* istanbul ignore next */
  async depositToUDC(amount: BigNumber): Promise<void> {
    await this.raiden.depositToUDC(amount);
  }

  /* istanbul ignore next */
  async getUDCCapacity(): Promise<BigNumber> {
    return this.raiden.getUDCCapacity();
  }

  async getAvailability(address: string): Promise<boolean> {
    try {
      const { available } = await this.raiden.getAvailability(address);
      return available;
    } catch (e) {
      this.store.commit('updatePresence', { [address]: false });
    }

    return false;
  }
}

export class ChannelSettleFailed extends Error {}

export class ChannelCloseFailed extends Error {}

export class ChannelOpenFailed extends Error {}

export class ChannelDepositFailed extends Error {}

export class EnsResolveFailed extends Error {}

export class TransferFailed extends Error {}

export class RaidenInitializationFailed extends Error {}

export class FindRoutesFailed extends Error {}

export class PFSRequestFailed extends Error {}
