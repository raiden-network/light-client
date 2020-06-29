import {
  ChangeEvent,
  ErrorCodes,
  EventTypes,
  Raiden,
  RaidenError,
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
import { ConfigProvider, Configuration } from '@/services/config-provider';
import { Zero } from 'ethers/constants';
import i18n from '@/i18n';
import { Notification } from '@/store/notifications/types';

export default class RaidenService {
  private _raiden?: Raiden;
  private store: Store<RootState>;
  private _userDepositTokenAddress: string = '';
  private _configuration?: Configuration;

  private static async createRaiden(
    provider: any,
    account: string | number = 0,
    stateBackup?: string,
    subkey?: true
  ): Promise<Raiden> {
    try {
      const contracts = await ConfigProvider.contracts();
      return await Raiden.create(
        provider,
        account,
        {
          storage: window.localStorage,
          state: stateBackup
        },
        contracts,
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

    this.store.commit('updateTokenAddresses', allTokens);
    this.store.commit('updateTokens', placeholders);
    await this.fetchTokenData(toFetch);
  }

  constructor(store: Store<RootState>) {
    this._raiden = undefined;
    this.store = store;
  }

  /* istanbul ignore next */
  get monitoringReward(): BigNumber | null {
    return this.raiden.config.monitoringReward;
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
      let raiden;
      const configuration = await ConfigProvider.configuration();
      const provider = await Web3Provider.provider(configuration.rpc_endpoint);

      if (!provider) {
        this.store.commit('noProvider');
      } else {
        // Check if trying to connect to main net
        // and whether main net is allowed
        /* istanbul ignore if */
        if (
          typeof provider !== 'string' &&
          'networkVersion' in provider &&
          provider.networkVersion === '1' &&
          process.env.VUE_APP_ALLOW_MAINNET === 'false'
        ) {
          throw new RaidenError(ErrorCodes.RDN_UNRECOGNIZED_NETWORK);
        }

        raiden = await RaidenService.createRaiden(
          provider,
          configuration?.private_key,
          stateBackup,
          subkey
        );

        this._raiden = raiden;
        this._configuration = configuration;

        const account = await this.getAccount();
        this.store.commit('account', account);

        this._userDepositTokenAddress = await raiden.userDepositTokenAddress();
        await this.fetchTokenData([this._userDepositTokenAddress]);
        this.store.commit(
          'userDepositTokenAddress',
          this._userDepositTokenAddress
        );

        await this.monitorPreSetTokens();

        // update connected tokens data on each newBlock
        raiden.events$
          .pipe(
            filter(value => value.type === 'block/new'),
            exhaustMap(() =>
              this.fetchTokenData(
                this.store.getters.tokens.map((m: TokenModel) => m.address)
              )
            )
          )
          .subscribe();

        raiden.events$
          .pipe(filter(value => value.type === 'raiden/shutdown'))
          .subscribe(() => this.store.commit('reset'));

        raiden.config$.subscribe(config =>
          this.store.commit('updateConfig', config)
        );

        raiden.events$.subscribe(async value => {
          if (value.type === 'token/monitored') {
            this.store.commit('updateTokens', {
              [value.payload.token]: { address: value.payload.token }
            });
          }

          // Update presences on matrix presence updates
          else if (value.type === 'matrix/presence/success') {
            this.store.commit('updatePresence', {
              [value.meta.address]: value.payload.available
            });
          } else if (value.type === 'ms/balanceProof/sent') {
            if (!value.payload.confirmed) {
              return;
            }
            await this.notifyBalanceProofSend(
              value.payload.monitoringService,
              value.payload.partner,
              value.payload.reward,
              value.payload.txHash
            );
          } else if (value.type === 'udc/withdrawn') {
            if (!value.payload.confirmed) {
              return;
            }
            await this.notifyWithdrawal(
              value.meta.amount,
              value.payload.withdrawal
            );
          } else if (value.type === 'udc/withdraw/failure') {
            await this.notifyWithdrawalFailure(
              value.payload?.code,
              value.meta.amount,
              value.payload.message
            );
          }
        });

        raiden.channels$.subscribe(value => {
          this.store.commit('updateChannels', value);
        });

        // Subscribe to our pending transfers
        raiden.transfers$.subscribe(transfer => {
          this.store.commit('updateTransfers', transfer);
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

  private async monitorPreSetTokens() {
    const { chainId } = this.raiden.network;
    if (!this._configuration?.per_network?.[chainId]) {
      return;
    }

    const networkConfiguration = this._configuration.per_network[chainId];

    for (const token of networkConfiguration.monitored) {
      await this.raiden.monitorToken(token);
    }
  }

  private async notifyWithdrawalFailure(
    code: any,
    plannedAmount: BigNumber,
    message: string
  ) {
    if (
      [
        'UDC_PLAN_WITHDRAW_GT_ZERO',
        'UDC_PLAN_WITHDRAW_EXCEEDS_AVAILABLE',
        'UDC_PLAN_WITHDRAW_FAILED'
      ].indexOf(code) >= 0
    ) {
      return;
    }
    const token = this.store.getters.udcToken;
    const decimals = token.decimals ?? 18;
    const amount = BalanceUtils.toUnits(plannedAmount, decimals);

    const codeDescription =
      typeof code === 'string'
        ? i18n.t(`notifications.withdrawal.failure.descriptions.${code}`, {
            amount,
            symbol: token.symbol
          })
        : undefined;

    const description = codeDescription
      ? codeDescription
      : i18n.t('notifications.withdrawal.failure.description', {
          amount,
          symbol: token.symbol,
          message: message
        });

    await this.store.dispatch('notifications/notify', {
      title: i18n.t('notifications.withdrawal.failure.title'),
      description
    } as Notification);
  }

  private async notifyWithdrawal(
    plannedAmount: BigNumber,
    withdrawal: BigNumber
  ) {
    const token = this.store.getters.udcToken;
    const decimals = token.decimals ?? 18;
    const amount = BalanceUtils.toUnits(plannedAmount, decimals);
    const withdrawn = BalanceUtils.toUnits(withdrawal, decimals);

    await this.store.dispatch('notifications/notify', {
      title: i18n.t('notifications.withdrawal.success.title'),
      description: i18n.t('notifications.withdrawal.success.description', {
        amount,
        withdrawn,
        symbol: token.symbol
      })
    } as Notification);
  }

  private async notifyBalanceProofSend(
    monitoringService: string,
    partner: string,
    reward: BigNumber,
    txHash: string
  ) {
    const token = this.store.getters.udcToken;
    const decimals = token.decimals ?? 18;
    const amount = BalanceUtils.toUnits(reward, decimals);

    await this.store.dispatch('notifications/notify', {
      title: i18n.t('notifications.ms-balance-proof.title'),
      description: i18n.t('notifications.ms-balance-proof.description', {
        monitoringService,
        partner,
        reward: amount,
        txHash
      })
    } as Notification);
  }

  disconnect() {
    this.raiden.stop();
  }

  async getAccount(): Promise<string> {
    return this.raiden.address;
  }

  /* istanbul ignore next */
  async getMainAccount(): Promise<string | undefined> {
    return this.raiden.mainAddress;
  }

  async getBalance(address?: string): Promise<string> {
    const balance = await this.raiden.getBalance(address);
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

    await raiden.openChannel(token, partner, { deposit: amount }, e =>
      e.type === EventTypes.OPENED ? progressUpdater(2, 3) : ''
    );
  }

  async closeChannel(token: string, partner: string) {
    await this.raiden.closeChannel(token, partner);
  }

  async deposit(token: string, partner: string, amount: BigNumber) {
    await this.raiden.depositChannel(token, partner, amount);
  }

  async settleChannel(token: string, partner: string) {
    await this.raiden.settleChannel(token, partner);
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
    const key = await this.raiden.transfer(token, target, amount, {
      paymentId,
      paths
    });

    // Wait for transaction to be completed
    await this.raiden.waitTransfer(key);
  }

  async findRoutes(
    token: string,
    target: string,
    amount: BigNumber,
    raidenPFS?: RaidenPFS
  ): Promise<RaidenPaths> {
    await this.raiden.getAvailability(target);
    return await this.raiden.findRoutes(token, target, amount, {
      pfs: raidenPFS
    });
  }

  async fetchServices(): Promise<RaidenPFS[]> {
    return await this.raiden.findPFS();
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
  async planUdcWithdraw(amount: BigNumber): Promise<string> {
    return this.raiden.planUdcWithdraw(amount);
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

  /* istanbul ignore next */
  async transferOnChainTokens(address: string, amount: BigNumberish) {
    const mainAddress = this.raiden.mainAddress;
    if (!mainAddress) {
      return;
    }
    await this.raiden.transferOnchainTokens(address, mainAddress, amount, {
      subkey: true
    });
  }

  async getRaidenAccountBalances(): Promise<Token[]> {
    const raiden = this.raiden;
    if (!raiden.mainAddress) {
      return [];
    }
    const allTokens = await raiden.getTokenList();
    const balances: Tokens = {};
    const fetchTokenBalance = async (address: string): Promise<void> =>
      raiden.getTokenBalance(address, raiden.address).then(balance => {
        if (balance.gt(Zero)) {
          balances[address] = {
            address,
            balance
          };
        }
      });

    await asyncPool(6, allTokens, fetchTokenBalance);
    const tokens: Tokens = {};
    Object.keys(balances).forEach(address => {
      const cached = this.store.state.tokens[address];
      if (cached) {
        tokens[address] = { ...cached, ...balances[address] };
        delete balances[address];
      }
    });

    const fetchTokenInfo = async (address: string): Promise<void> =>
      raiden.getTokenInfo(address).then(token => {
        tokens[address] = { ...token, ...balances[address] };
      });

    const missingInfo = Object.keys(balances);
    if (missingInfo.length > 0) {
      await asyncPool(6, missingInfo, fetchTokenInfo);
    }

    return Object.values(tokens);
  }

  async monitorToken(address: string) {
    await this.raiden.monitorToken(address);
  }
}

export class EnsResolveFailed extends Error {}

export class RaidenInitializationFailed extends Error {}
