import { Raiden } from 'raiden';
import { Store } from 'vuex';
import { RootState } from '@/types';
import { Web3Provider } from '@/services/web3-provider';
import { Subscription } from 'rxjs';
import { BalanceUtils } from '@/utils/balance-utils';
import { Token } from '@/model/token';
import { BigNumber } from 'ethers/utils';

export default class RaidenService {
  private _raiden?: Raiden;
  private store: Store<RootState>;
  private subscription?: Subscription;

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

  async connect() {
    try {
      const provider = await Web3Provider.provider();
      if (!provider) {
        this.store.commit('noProvider');
      } else {
        this._raiden = await Raiden.create(provider, 0, window.localStorage);

        this.store.commit('account', await this.getAccount());
        this.store.commit('balance', await this.getBalance());

        this.subscription = this._raiden.channels$.subscribe(value => {
          this.store.commit('updateChannels', value);
        });
      }
    } catch (e) {
      console.error(e);
      this.store.commit('deniedAccess');
    }

    this.store.commit('loadComplete');
  }

  disconnect() {
    if (!this.subscription) {
      return;
    }
    this.subscription.unsubscribe();
  }

  async getAccount(): Promise<string> {
    return this.raiden.address;
  }

  async getBalance(): Promise<string> {
    const balance = await this.raiden.getBalance();
    return BalanceUtils.toEth(balance);
  }

  async getToken(tokenAddress: string): Promise<Token | null> {
    const raiden = this.raiden;
    try {
      const tokenBalance = await raiden.getTokenBalance(tokenAddress);
      const balance = tokenBalance.balance;
      const decimals = tokenBalance.decimals;
      return {
        balance: balance,
        decimals: decimals,
        units: BalanceUtils.toUnits(balance, decimals),
        address: tokenAddress
      };
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async openChannel(
    tokenAddress: string,
    hubAddress: string,
    depositAmount: BigNumber
  ): Promise<boolean> {
    const raiden = this.raiden;
    try {
      await raiden.openChannel(tokenAddress, hubAddress);
    } catch (e) {
      throw new OpenChannelFailed(e);
    }

    try {
      await raiden.depositChannel(tokenAddress, hubAddress, depositAmount);
    } catch (e) {
      throw new DepositFailed(e);
    }

    return true;
  }

  async monitorToken(token: string) {
    await this.raiden.monitorToken(token);
  }
}

export class OpenChannelFailed extends Error {}

export class DepositFailed extends Error {}
