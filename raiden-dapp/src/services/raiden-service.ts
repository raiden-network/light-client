import {
  ChangeEvent,
  EventTypes,
  Raiden,
  RaidenPaths,
  RaidenPFS
} from 'raiden-ts';
import { Store } from 'vuex';
import { RootState, Tokens } from '@/types';
import { Web3Provider } from '@/services/web3-provider';
import { BalanceUtils } from '@/utils/balance-utils';
import { DeniedReason, Progress, Token, TokenModel } from '@/model/types';
import { BigNumber, BigNumberish, parseEther } from 'ethers/utils';
import { exhaustMap, filter } from 'rxjs/operators';
import asyncPool from 'tiny-async-pool';
import { ConfigProvider } from './config-provider';

export default class RaidenService {
  private _raiden?: Raiden;
  private store: Store<RootState>;
  private _userDepositTokenAddress: string = '';

  private static async createRaiden(
    provider: any,
    account: string | number = 0,
    stateBackup?: string,
    subkey?: true
  ): Promise<Raiden> {
    try {
      return await Raiden.create(
        provider,
        account,
        {
          storage: window.localStorage,
          state: stateBackup
        },
        undefined,
        {
          pfsSafetyMargin: 1.1,
          pfs: process.env.VUE_APP_PFS,
          matrixServer: process.env.VUE_APP_TRANSPORT
        },
        subkey
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

  private async updateBalances(): Promise<void> {
    this.store.commit('balance', await this.getBalance());
    this.store.commit(
      'raidenAccountBalance',
      await this.getBalance(this.raiden.address)
    );
  }

  async fetchTokenList() {
    const allTokens = await this.raiden.getTokenList();
    const toFetch: string[] = [];
    const placeholders: Tokens = {};

    for (const token of allTokens) {
      toFetch.push(token);
      placeholders[token] = { address: token };
    }

    this.store.commit('updateTokens', placeholders);
    await this.fetchTokenData(toFetch);
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
      return await this.raiden.resolveName(name);
    } catch (e) {
      throw new EnsResolveFailed(e);
    }
  }

  async connect(stateBackup?: string, subkey?: true) {
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
            config.PRIVATE_KEY,
            stateBackup,
            subkey
          );
        } else {
          raiden = await RaidenService.createRaiden(
            provider,
            undefined,
            stateBackup,
            subkey
          );
        }

        this._raiden = raiden;

        const account = await this.getAccount();
        this.store.commit('account', account);

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
        raiden.transfers$.subscribe(transfer => {
          if (transfer.initiator === account) {
            this.store.commit('updateTransfers', transfer);
          }
        });

        this.store.commit('network', raiden.network);

        window.addEventListener('beforeunload', () => this.raiden.stop());
        raiden.start();
        this.store.commit('balance', await this.getBalance());
        if (subkey) {
          this.store.commit(
            'raidenAccountBalance',
            await this.getBalance(raiden.address)
          );
        }
      }
    } catch (e) {
      let deniedReason: DeniedReason;
      if (e.message && e.message.indexOf('No deploy info provided') > -1) {
        deniedReason = DeniedReason.UNSUPPORTED_NETWORK;
      } else if (
        e.message &&
        e.message.indexOf('Could not replace stored state') > -1
      ) {
        deniedReason = DeniedReason.RDN_STATE_MIGRATION;
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

  async getMainAccount(): Promise<string | undefined> {
    return this.raiden.mainAddress;
  }

  async getBalance(address?: string): Promise<string> {
    const balance = await this.raiden.getBalance(address);
    return BalanceUtils.toEth(balance);
  }

  async getUpdatedBalances(tokens: Tokens): Promise<Token[]> {
    if (!Object.keys(tokens).length) return [];
    const accountAddress = this.raiden.address;
    const updatedTokens = { ...tokens };
    const addresses = Object.keys(updatedTokens);
    const fetchToken = async (address: string): Promise<void> =>
      this.raiden.getTokenBalance(address, accountAddress).then(balance => {
        if (!balance) return;
        updatedTokens[address] = { ...updatedTokens[address], balance };
      });

    await asyncPool(6, addresses, fetchToken);
    return Object.values(updatedTokens);
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
      await raiden.openChannel(token, partner, { deposit: amount }, e =>
        e.type === EventTypes.OPENED ? progressUpdater(2, 3) : ''
      );
    } catch (e) {
      throw new ChannelOpenFailed(e);
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
    paths: RaidenPaths,
    paymentId: BigNumber
  ) {
    try {
      const secretHash = await this.raiden.transfer(token, target, amount, {
        paymentId,
        paths
      });

      // Wait for transaction to be completed
      await this.raiden.waitTransfer(secretHash);
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

    await this.raiden.getAvailability(target);
    routes = await this.raiden.findRoutes(token, target, amount, {
      pfs: raidenPFS
    });

    return routes;
  }

  async fetchServices(): Promise<RaidenPFS[]> {
    let raidenPFS: RaidenPFS[];
    raidenPFS = await this.raiden.findPFS();
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
  async depositToUDC(amount: BigNumber, depositing: () => void): Promise<void> {
    await this.raiden.depositToUDC(
      amount,
      (event: ChangeEvent<EventTypes, { txHash: string }>) =>
        event.type === EventTypes.APPROVED ? depositing() : null
    );
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

  /* istanbul ignore next */
  async getState() {
    this._raiden?.stop();
    return await this._raiden?.state$.toPromise();
  }

  /* istanbul ignore next */
  async transferToRaidenAccount(amount: string) {
    await this.raiden.transferOnchainBalance(
      this.raiden.address,
      parseEther(amount)
    );
    await this.updateBalances();
  }

  /* istanbul ignore next */
  async transferToMainAccount(amount: string) {
    const { mainAddress } = this.raiden;
    if (mainAddress) {
      await this.raiden.transferOnchainBalance(
        mainAddress,
        parseEther(amount),
        { subkey: true }
      );
      await this.updateBalances();
    }
  }

  async transferOnChainTokens(address: string, amount: BigNumberish) {
    const mainAddress = this.raiden.mainAddress;
    if (!mainAddress) {
      return;
    }
    await this.raiden.transferOnchainTokens(address, mainAddress, amount, {
      subkey: true
    });
  }
}

export class ChannelSettleFailed extends Error {}

export class ChannelCloseFailed extends Error {}

export class ChannelOpenFailed extends Error {}

export class ChannelDepositFailed extends Error {}

export class EnsResolveFailed extends Error {}

export class TransferFailed extends Error {}

export class RaidenInitializationFailed extends Error {}
