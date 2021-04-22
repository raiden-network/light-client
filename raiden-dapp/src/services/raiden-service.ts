import type { BigNumber, BigNumberish, providers } from 'ethers';
import { constants, utils } from 'ethers';
import type { ObservedValueOf } from 'rxjs';
import { exhaustMap, filter } from 'rxjs/operators';
import asyncPool from 'tiny-async-pool';
import type Router from 'vue-router';
import type { Store } from 'vuex';

import type { ChangeEvent, RaidenPaths, RaidenPFS } from 'raiden-ts';
import { Capabilities, ErrorCodes, EventTypes, PfsMode, Raiden, RaidenError } from 'raiden-ts';

import i18n from '@/i18n';
import type { Progress, Token } from '@/model/types';
import { DeniedReason } from '@/model/types';
import { RouteNames } from '@/router/route-names';
import type { Configuration } from '@/services/config-provider';
import { ConfigProvider } from '@/services/config-provider';
import { Web3Provider } from '@/services/web3-provider';
import type { CombinedStoreState } from '@/store';
import { NotificationContext } from '@/store/notifications/notification-context';
import { NotificationImportance } from '@/store/notifications/notification-importance';
import type { NotificationPayload } from '@/store/notifications/types';
import type { SuggestedPartner, Tokens } from '@/types';
import { BalanceUtils } from '@/utils/balance-utils';

function raidenActionConfirmationValueToStateTranslation(
  confirmationValue: boolean | undefined,
): string {
  if (confirmationValue === undefined) {
    return i18n.t('notifications.tx-state-pending') as string;
  } else if (confirmationValue) {
    return i18n.t('notifications.tx-state-confirmed') as string;
  } else {
    return ''; // Reorged actions get a special error notification.
  }
}

export default class RaidenService {
  private _raiden?: Raiden;
  private store: Store<CombinedStoreState>;
  private router: Router;
  private _userDepositTokenAddress = '';
  private _configuration?: Configuration;
  public usingSubkey: boolean | undefined;

  private static async createRaiden(
    provider: providers.JsonRpcProvider | providers.ExternalProvider | string,
    account: string | number = 0,
    stateBackup?: string,
    subkey?: true,
  ): Promise<Raiden> {
    try {
      const contracts = await ConfigProvider.contracts();
      return await Raiden.create(
        provider,
        account,
        {
          state: stateBackup,
        },
        process.env.VUE_APP_UDC_ADDRESS ?? contracts,
        {
          pfsSafetyMargin: 1.1,
          ...(process.env.VUE_APP_PFS
            ? { pfsMode: PfsMode.onlyAdditional, additionalServices: [process.env.VUE_APP_PFS] }
            : {}),
          matrixServer: process.env.VUE_APP_MATRIX_SERVER,
          matrixServerLookup: process.env.VUE_APP_MATRIX_LIST_URL,
          ...(process.env.VUE_APP_REVEAL_TIMEOUT && +process.env.VUE_APP_REVEAL_TIMEOUT
            ? { revealTimeout: +process.env.VUE_APP_REVEAL_TIMEOUT }
            : undefined),
          ...(process.env.VUE_APP_SETTLE_TIMEOUT && +process.env.VUE_APP_SETTLE_TIMEOUT
            ? { settleTimeout: +process.env.VUE_APP_SETTLE_TIMEOUT }
            : undefined),
          ...(process.env.VUE_APP_CONFIRMATION_BLOCKS && +process.env.VUE_APP_CONFIRMATION_BLOCKS
            ? { confirmationBlocks: +process.env.VUE_APP_CONFIRMATION_BLOCKS }
            : undefined),
          ...(process.env.VUE_APP_EXPIRY_FACTOR && +process.env.VUE_APP_EXPIRY_FACTOR
            ? { expiryFactor: +process.env.VUE_APP_EXPIRY_FACTOR }
            : undefined),
        },
        subkey,
        process.env.VUE_APP_SUBKEY_ORIGIN_URL,
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
    this.store.commit('raidenAccountBalance', await this.getBalance(this.raiden.address));
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
    await this.fetchAndUpdateTokenData(toFetch);
  }

  constructor(store: Store<CombinedStoreState>, router: Router) {
    this._raiden = undefined;
    this.store = store;
    this.router = router;
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
      const provider = await Web3Provider.provider(
        configuration.rpc_endpoint,
        configuration.rpc_endpoint_wallet_connect,
      );

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
          process.env.VUE_APP_ALLOW_MAINNET !== 'true'
        ) {
          throw new RaidenError(ErrorCodes.RDN_UNRECOGNIZED_NETWORK);
        }

        raiden = await RaidenService.createRaiden(
          provider,
          configuration?.private_key,
          stateBackup,
          subkey,
        );

        this._raiden = raiden;
        this._configuration = configuration;
        this.usingSubkey = subkey ?? false;

        const account = this.getAccount();
        this.store.commit('account', account);

        this._userDepositTokenAddress = await raiden.userDepositTokenAddress();
        this.store.commit('userDepositContract/setTokenAddress', this._userDepositTokenAddress);

        await this.monitorPreSetTokens();

        // update connected tokens data on each newBlock
        raiden.events$
          .pipe(filter((value) => value.type === 'block/new'))
          .subscribe((event) => this.store.commit('updateBlock', event.payload.blockNumber));

        raiden.events$
          .pipe(
            filter((value) => value.type === 'block/new'),
            exhaustMap(() => this.updateUserDepositContractToken()),
          )
          .subscribe();

        raiden.events$.pipe(filter((value) => value.type === 'raiden/shutdown')).subscribe(() => {
          this.store.commit('reset');
          this.router.push({ name: RouteNames.HOME });
        });

        raiden.config$.subscribe(async (config) => {
          this.store.commit('updateConfig', config);
          if (!config.caps?.[Capabilities.RECEIVE]) {
            await this.notifyNoReceive();
          }
        });

        raiden.events$.subscribe(async (value) => {
          if (value.type === 'token/monitored') {
            this.store.commit('updateTokens', {
              [value.payload.token]: { address: value.payload.token },
            });
            this.fetchAndUpdateTokenData([value.payload.token]);
          } else if (value.type === 'matrix/presence/success') {
            // Update presences on matrix presence updates
            this.store.commit('updatePresence', {
              [value.meta.address]: value.payload.available,
            });
          } else if (value.type === 'ms/balanceProof/sent') {
            if (!value.payload.confirmed) {
              return;
            }
            await this.notifyBalanceProofSend(
              value.payload.monitoringService,
              value.payload.partner,
              value.payload.reward,
              value.payload.txHash,
            );
          } else if (value.type === 'udc/withdraw/success') {
            if (!value.payload.confirmed) {
              return;
            }
            await this.notifyWithdrawal(value.meta.amount, value.payload.withdrawal);
          } else if (value.type === 'udc/withdraw/plan/failure') {
            await this.notifyWithdrawalFailure(
              value.payload?.code,
              value.meta.amount,
              value.payload.message,
            );
          } else if (value.type === 'channel/settle/success') {
            if (value.payload.confirmed) {
              await this.notifyChannelSettleSuccess(value.meta.partner);
            }
          } else if (value.type === 'channel/settle/failure') {
            await this.notifyChannelSettleFailure(value.meta.partner);
          } else if (value.type === 'channel/open/success') {
            await this.notifyChannelOpenSuccess(
              value.payload.txBlock,
              value.payload.txHash,
              value.payload.confirmed,
              value.meta.partner,
            );
          } else if (value.type === 'channel/open/failed') {
            await this.notifyChannelOpenFailed(value.payload.message);
          }
        });

        raiden.events$.subscribe((event) => {
          this.updatePlannedUserDepositWithdrawals(event);
        });

        raiden.channels$.subscribe((value) => {
          this.store.commit('updateChannels', value);
        });

        // Subscribe to our pending transfers
        raiden.transfers$.subscribe((transfer) => {
          this.store.commit('updateTransfers', transfer);
        });

        this.store.commit('network', raiden.network);

        /* istanbul ignore next */
        window.addEventListener('beforeunload', (event) => {
          event.preventDefault();
          return ''; // Some engines like Chrome expect this.
        });

        await raiden.start();
        this.store.commit('balance', await this.getBalance());
        if (subkey) {
          this.store.commit('raidenAccountBalance', await this.getBalance(raiden.address));
        }
      }
    } catch (e) {
      let deniedReason: DeniedReason;
      if (e.message && e.message.indexOf('No deploy info provided') > -1) {
        deniedReason = DeniedReason.UNSUPPORTED_NETWORK;
      } else if (e.message && e.message.indexOf('Could not replace stored state') > -1) {
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

  private async notifyNoReceive() {
    this.store.commit('notifications/notificationAddOrReplace', {
      icon: i18n.t('notifications.no-receive.icon'),
      title: i18n.t('notifications.no-receive.title'),
      description: i18n.t('notifications.no-receive.description'),
      importance: NotificationImportance.HIGH,
      context: NotificationContext.WARNING,
    } as NotificationPayload);
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

  private async notifyWithdrawalFailure(code: string, plannedAmount: BigNumber, message: string) {
    if (
      [
        'UDC_PLAN_WITHDRAW_GT_ZERO',
        'UDC_PLAN_WITHDRAW_EXCEEDS_AVAILABLE',
        'UDC_PLAN_WITHDRAW_FAILED',
      ].indexOf(code) >= 0
    ) {
      return;
    }
    // UDC token must be defined here after the initial loading phase.
    const token = this.store.state.userDepositContract.token!;
    const decimals = token.decimals ?? 18;
    const amount = BalanceUtils.toUnits(plannedAmount, decimals);

    const codeDescription =
      typeof code === 'string'
        ? i18n.t(`notifications.withdrawal.failure.descriptions.${code}`, {
            amount,
            symbol: token.symbol,
          })
        : undefined;

    const description = codeDescription
      ? codeDescription
      : i18n.t('notifications.withdrawal.failure.description', {
          amount,
          symbol: token.symbol,
          message: message,
        });

    this.store.commit('notifications/notificationAddOrReplace', {
      title: i18n.t('notifications.withdrawal.failure.title'),
      description,
      context: NotificationContext.ERROR,
      importance: NotificationImportance.HIGH,
    } as NotificationPayload);
  }

  private async notifyWithdrawal(amount: BigNumber, withdrawn: BigNumber) {
    // UDC token must be defined here after the initial loading phase.
    const token = this.store.state.userDepositContract.token!;
    const decimals = token.decimals ?? 18;
    const plannedAmount = BalanceUtils.toUnits(amount, decimals);
    const withdrawnAmount = BalanceUtils.toUnits(withdrawn, decimals);

    let notificationPayload = {
      icon: i18n.t('notifications.withdrawn.icon'),
      title: i18n.t('notifications.withdrawn.title'),
      description: i18n.t('notifications.withdrawn.description', {
        plannedAmount,
        withdrawnAmount,
        symbol: token.symbol,
      }),
      context: NotificationContext.INFO,
      importance: NotificationImportance.HIGH,
    } as NotificationPayload;

    if (this.usingSubkey) {
      notificationPayload = {
        ...notificationPayload,
        link: i18n.t('notifications.withdrawn.link') as string,
        dappRoute: RouteNames.ACCOUNT_WITHDRAWAL,
      };
    }

    this.store.commit('notifications/notificationAddOrReplace', notificationPayload);
  }

  private async notifyBalanceProofSend(
    monitoringService: string,
    partner: string,
    reward: BigNumber,
    txHash: string,
  ) {
    // UDC token must be defined here after the initial loading phase.
    const token = this.store.state.userDepositContract.token!;
    const decimals = token.decimals ?? 18;
    const amount = BalanceUtils.toUnits(reward, decimals);

    this.store.commit('notifications/notificationAddOrReplace', {
      title: i18n.t('notifications.ms-balance-proof.title'),
      description: i18n.t('notifications.ms-balance-proof.description', {
        monitoringService,
        partner,
        reward: amount,
        symbol: token.symbol,
        txHash,
      }),
      context: NotificationContext.INFO,
      importance: NotificationImportance.HIGH,
    } as NotificationPayload);
  }

  private async notifyChannelSettleSuccess(partner: string) {
    const description = i18n.t('notifications.settlement.success.description', {
      partner,
    });

    this.store.commit('notifications/notificationAddOrReplace', {
      title: i18n.t('notifications.settlement.success.title'),
      description,
      icon: i18n.t('notifications.settlement.icon'),
      context: NotificationContext.NONE,
      importance: NotificationImportance.HIGH,
    } as NotificationPayload);
  }

  private async notifyChannelSettleFailure(partner: string) {
    this.store.commit('notifications/notificationAddOrReplace', {
      title: i18n.t('notifications.settlement.failure.title'),
      description: i18n.t('notifications.settlement.failure.description', {
        partner,
      }),
      icon: i18n.t('notifications.settlement.icon'),
      context: NotificationContext.NONE,
      importance: NotificationImportance.HIGH,
    } as NotificationPayload);
  }

  private async notifyChannelOpenSuccess(
    txBlock: number,
    txHash: string,
    txConfirmed: boolean | undefined,
    partner: string,
  ) {
    const confirmationBlocks = this.store.state.config?.confirmationBlocks ?? 0;
    const txConfirmationBlock = txBlock + confirmationBlocks;
    const icon = i18n.t('notifications.channel-open.icon');

    let title = '';
    let description = '';

    if (txConfirmed === undefined || txConfirmed === true) {
      title = i18n.t('notifications.channel-open.success.title') as string;
      const state = raidenActionConfirmationValueToStateTranslation(txConfirmed);
      description = i18n.t('notifications.channel-open.success.description', {
        partner,
        state,
      }) as string;
    } else {
      const reason = i18n.t('notifications.tx-reorged-failure-reason');
      title = i18n.t('notifications.channel-open.failure.title') as string;
      description = i18n.t('notifications.channel-open.failure.description', { reason }) as string;
    }

    const notificationPayload = {
      title,
      description,
      icon,
      txHash,
      txConfirmationBlock,
      importance: NotificationImportance.HIGH,
    };

    this.store.commit('notifications/notificationAddOrReplace', notificationPayload);
  }

  private async notifyChannelOpenFailed(reason: string) {
    this.store.commit('notifications/notificationAddOrReplace', {
      title: i18n.t('notifications.channel-open.failure.title'),
      description: i18n.t('notifications.channel-open.failure.description', { reason }),
      icon: i18n.t('notifications.channel-open.icon'),
      importance: NotificationImportance.HIGH,
    });
  }

  private async updatePlannedUserDepositWithdrawals(event: ObservedValueOf<Raiden['events$']>) {
    if (event.type === 'udc/withdraw/plan/success') {
      if (event.payload.confirmed === false) {
        this.store.commit('userDepositContract/clearPlannedWithdrawal');
      } else {
        this.store.commit('userDepositContract/setPlannedWithdrawal', {
          txHash: event.payload.txHash,
          txBlock: event.payload.txBlock,
          amount: event.meta.amount,
          withdrawBlock: event.payload.block,
          confirmed: event.payload.confirmed,
        });
      }
    } else if (event.type === 'udc/withdraw/success' && event.payload.confirmed) {
      this.store.commit('userDepositContract/clearPlannedWithdrawal');
    }
  }

  disconnect = async (): Promise<void> => {
    await this.raiden.stop();
  };

  getAccount = (): string => {
    return this.raiden.address;
  };

  /* istanbul ignore next */
  getMainAccount = (): string | undefined => {
    return this.raiden.mainAddress;
  };

  async getBalance(address?: string): Promise<string> {
    const balance = await this.raiden.getBalance(address);
    return BalanceUtils.toEth(balance);
  }

  private async getToken(tokenAddress: string): Promise<Token | null> {
    const raiden = this.raiden;
    try {
      const [balance, { decimals, symbol, name }] = await Promise.all([
        raiden.getTokenBalance(tokenAddress),
        raiden.getTokenInfo(tokenAddress),
      ]);
      return {
        name: name,
        symbol: symbol,
        balance: balance,
        decimals: decimals,
        address: tokenAddress,
      };
    } catch (e) {
      return null;
    }
  }

  async openChannel(
    token: string,
    partner: string,
    amount: BigNumber,
    progress?: (progress: Progress) => void,
  ): Promise<void> {
    const progressUpdater = (current: number, total: number) => {
      if (progress) {
        progress({
          current,
          total,
        });
      }
    };

    const raiden = this.raiden;
    progressUpdater(1, 3);

    await raiden.openChannel(token, partner, { deposit: amount }, (e) =>
      e.type === EventTypes.OPENED ? progressUpdater(2, 3) : '',
    );
  }

  async closeChannel(token: string, partner: string) {
    await this.raiden.closeChannel(token, partner);
  }

  async deposit(token: string, partner: string, amount: BigNumber) {
    await this.raiden.depositChannel(token, partner, amount);
  }

  async withdraw(token: string, partner: string, amount: BigNumber) {
    await this.raiden.withdrawChannel(token, partner, amount);
  }

  async settleChannel(token: string, partner: string) {
    await this.raiden.settleChannel(token, partner);
  }

  async updateUserDepositContractToken(): Promise<void> {
    const token = await this.getToken(this._userDepositTokenAddress);
    this.store.commit('userDepositContract/setToken', token);
  }

  async fetchAndUpdateTokenData(
    tokens: string[] = Object.values(this.store.state.tokens).map((m) => m.address),
  ): Promise<void> {
    if (!tokens.length) return;
    const fetchToken = async (address: string): Promise<void> =>
      this.getToken(address).then((token) => {
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
    paymentId: BigNumber,
  ) {
    const key = await this.raiden.transfer(token, target, amount, {
      paymentId,
      paths,
    });

    // Wait for transaction to be completed
    await this.raiden.waitTransfer(key);
  }

  async findRoutes(
    token: string,
    target: string,
    amount: BigNumber,
    raidenPFS?: RaidenPFS,
  ): Promise<RaidenPaths> {
    return await this.raiden.findRoutes(token, target, amount, {
      pfs: raidenPFS,
    });
  }

  async fetchServices(): Promise<RaidenPFS[]> {
    return await this.raiden.findPFS();
  }

  /* istanbul ignore next */
  async directRoute(
    token: string,
    target: string,
    value: BigNumberish,
  ): Promise<RaidenPaths | undefined> {
    return await this.raiden.directRoute(token, target, value);
  }

  /* istanbul ignore next */
  async mint(token: string, amount: BigNumber): Promise<string> {
    return await this.raiden.mint(token, amount);
  }

  /* istanbul ignore next */
  async depositToUDC(amount: BigNumber, depositing: () => void): Promise<void> {
    await this.raiden.depositToUDC(amount, (event: ChangeEvent<EventTypes, { txHash: string }>) =>
      event.type === EventTypes.APPROVED ? depositing() : null,
    );
  }

  /* istanbul ignore next */
  async planUDCWithdraw(amount: BigNumber): Promise<string> {
    return this.raiden.planUDCWithdraw(amount);
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
    this._raiden!.stop();
    return this._raiden!.dumpDatabase();
  }

  /* istanbul ignore next */
  async transferToRaidenAccount(amount: string) {
    await this.raiden.transferOnchainBalance(this.raiden.address, utils.parseEther(amount));
    await this.updateBalances();
  }

  /* istanbul ignore next */
  async transferToMainAccount(amount: string) {
    const { mainAddress } = this.raiden;
    if (mainAddress) {
      await this.raiden.transferOnchainBalance(mainAddress, utils.parseEther(amount), {
        subkey: true,
      });
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
      subkey: true,
    });
  }

  async getRaidenAccountBalances(): Promise<Token[]> {
    const raiden = this.raiden;
    if (!raiden.mainAddress) {
      return [];
    }
    const allTokenAddresses = await raiden.getTokenList();
    const balances: Tokens = {};
    const fetchTokenBalance = async (address: string): Promise<void> =>
      raiden.getTokenBalance(address, raiden.address).then((balance) => {
        if (balance.gt(constants.Zero)) {
          balances[address] = {
            address,
            balance,
          };
        }
      });

    await asyncPool(6, allTokenAddresses, fetchTokenBalance);
    const tokens: Tokens = {};
    Object.keys(balances).forEach((address) => {
      const cached = this.store.state.tokens[address];
      if (cached) {
        tokens[address] = { ...cached, ...balances[address] };
        delete balances[address];
      }
    });

    const fetchTokenInfo = async (address: string): Promise<void> =>
      raiden.getTokenInfo(address).then((token) => {
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

  async getTokenBalance(tokenAddress: string, raidenAccount?: string): Promise<BigNumber> {
    const tokenBalance = await this.raiden.getTokenBalance(tokenAddress, raidenAccount);
    return tokenBalance;
  }

  async getSuggestedPartners(token: string): Promise<SuggestedPartner[]> {
    return await this.raiden.suggestPartners(token);
  }
}

export class EnsResolveFailed extends Error {}

export class RaidenInitializationFailed extends Error {}
