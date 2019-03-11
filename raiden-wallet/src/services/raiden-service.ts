import { Raiden } from 'raiden';
import { Store } from 'vuex';
import { RootState } from '@/types';
import { Web3Provider } from '@/services/web3-provider';
import { Subscription } from 'rxjs';

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
      }
    } catch (e) {
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
    return '0';
  }

  async openChannel(
    tokenAddress: string,
    hubAddress: string,
    depositAmount: number
  ): Promise<boolean> {
    let success = false;
    try {
      await this.raiden.openChannel(tokenAddress, hubAddress, depositAmount);
      success = true;
    } catch (e) {
      success = false;
    }
    return success;
  }
}
