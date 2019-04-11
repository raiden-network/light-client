import { Raiden, RaidenChannel } from 'raiden';
import { Store } from 'vuex';
import { RootState } from '@/types';
import { Web3Provider } from '@/services/web3-provider';
import { Subscription } from 'rxjs';
import { BalanceUtils } from '@/utils/balance-utils';
import { LeaveNetworkResult, Progress, Token } from '@/model/types';
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
    token: string,
    partner: string,
    amount: BigNumber,
    progress?: (progress: Progress) => void
  ): Promise<boolean> {
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
      throw new OpenChannelFailed(e);
    }

    progressUpdater(2, 3);
    await this.deposit(token, partner, amount);

    return true;
  }

  async monitorToken(token: string) {
    await this.raiden.monitorToken(token);
  }

  async leaveNetwork(
    address: string,
    progress?: (progress: Progress) => void
  ): Promise<LeaveNetworkResult> {
    const channels: RaidenChannel[] = this.store.getters.channels(address);
    const result = {
      closed: 0,
      failed: 0
    };

    const total = channels.length;
    for (let i = 0; i < total; i++) {
      if (progress) {
        progress({
          current: i + 1,
          total: total
        });
      }

      const channel = channels[i];
      try {
        await this.closeChannel(channel.token, channel.partner);
        result.closed += 1;
      } catch (e) {
        result.failed += 1;
      }
    }

    return result;
  }

  async closeChannel(token: string, partner: string) {
    try {
      await this.raiden.closeChannel(token, partner);
    } catch (e) {
      throw new CloseChannelFailed(e);
    }
  }

  async deposit(token: string, partner: string, amount: BigNumber) {
    try {
      await this.raiden.depositChannel(token, partner, amount);
    } catch (e) {
      throw new DepositFailed(e);
    }
  }
}

export class CloseChannelFailed extends Error {}

export class OpenChannelFailed extends Error {}

export class DepositFailed extends Error {}
