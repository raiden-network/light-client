import Vue from 'vue';
import VuexPersistence from 'vuex-persist';
import Vuex, { StoreOptions } from 'vuex';
import { RootState, Settings, Tokens, Transfers } from '@/types';
import {
  ChannelState,
  getNetworkName,
  RaidenChannel,
  RaidenChannels,
  RaidenConfig,
  RaidenTransfer
} from 'raiden-ts';
import {
  AccTokenModel,
  DeniedReason,
  emptyTokenModel,
  PlaceHolderNetwork,
  Token,
  TokenModel,
  Presences
} from '@/model/types';
import map from 'lodash/map';
import flatMap from 'lodash/flatMap';
import filter from 'lodash/filter';
import clone from 'lodash/clone';
import reduce from 'lodash/reduce';
import orderBy from 'lodash/orderBy';
import isEqual from 'lodash/isEqual';
import isEmpty from 'lodash/isEmpty';
import { BigNumber, providers } from 'ethers';
import { notifications } from '@/store/notifications';

Vue.use(Vuex);

const _defaultState: RootState = {
  loading: true,
  blockNumber: 0,
  defaultAccount: '',
  accountBalance: '0.0',
  raidenAccountBalance: '',
  providerDetected: true,
  accessDenied: DeniedReason.UNDEFINED,
  channels: {},
  tokens: {},
  tokenAddresses: [],
  transfers: {},
  presences: {},
  network: PlaceHolderNetwork,
  stateBackup: '',
  settings: {
    isFirstTimeConnect: true,
    useRaidenAccount: true
  },
  config: {},
  userDepositTokenAddress: '',
  disclaimerAccepted: false,
  persistDisclaimerAcceptance: false
};

export function defaultState(): RootState {
  return clone(_defaultState);
}

/*
 * Helper function that checks whether two Tokens a and b
 * have a balance and if one of them isn't zero.
 */
const hasNonZeroBalance = (a: Token, b: Token) =>
  a.balance &&
  b.balance &&
  (!(a.balance as BigNumber).isZero() || !(b.balance as BigNumber).isZero());

const settingsLocalStorage = new VuexPersistence<RootState>({
  reducer: state => ({ settings: state.settings }),
  filter: mutation => mutation.type == 'updateSettings',
  key: 'raiden_dapp_settings'
});

const disclaimerAcceptedLocalStorage = new VuexPersistence<RootState>({
  reducer: state => ({
    disclaimerAccepted: state.persistDisclaimerAcceptance
      ? state.disclaimerAccepted
      : false
  }),
  filter: mutation => mutation.type === 'acceptDisclaimer',
  key: 'raiden_dapp_disclaimer_accepted'
});

const store: StoreOptions<RootState> = {
  state: defaultState(),
  mutations: {
    noProvider(state: RootState) {
      state.providerDetected = false;
    },
    accessDenied(state: RootState, reason: DeniedReason) {
      state.accessDenied = reason;
    },
    account(state: RootState, account: string) {
      state.defaultAccount = account;
    },
    loadComplete(state: RootState) {
      state.loading = false;
    },
    updateBlock(state: RootState, block: number) {
      state.blockNumber = block;
    },
    balance(state: RootState, balance: string) {
      state.accountBalance = balance;
    },
    raidenAccountBalance(state: RootState, balance: string) {
      state.raidenAccountBalance = balance;
    },
    updateChannels(state: RootState, channels: RaidenChannels) {
      state.channels = channels;
    },
    updateTokens(state: RootState, tokens: Tokens) {
      for (const [address, token] of Object.entries(tokens))
        if (address in state.tokens && isEqual(token, state.tokens[address]))
          continue;
        else if (address in state.tokens)
          state.tokens[address] = { ...state.tokens[address], ...token };
        else state.tokens = { ...state.tokens, [address]: token };
    },
    updateTokenAddresses(state: RootState, addresses: string[]) {
      state.tokenAddresses = [...addresses];
    },
    updatePresence(state: RootState, presence: Presences) {
      state.presences = { ...state.presences, ...presence };
    },
    network(state: RootState, network: providers.Network) {
      state.network = network;
    },
    reset(state: RootState) {
      // Preserve settings and backup when resetting state
      const { settings, disclaimerAccepted, stateBackup } = state;

      Object.assign(state, {
        ...defaultState(),
        settings,
        disclaimerAccepted,
        stateBackup
      });
    },
    updateTransfers(state: RootState, transfer: RaidenTransfer) {
      state.transfers = { ...state.transfers, [transfer.key]: transfer };
    },
    backupState(state: RootState, uploadedState: string) {
      state.stateBackup = uploadedState;
    },
    updateSettings(state: RootState, settings: Settings) {
      state.settings = settings;
    },
    updateConfig(state: RootState, config: Partial<RaidenConfig>) {
      state.config = config;
    },
    userDepositTokenAddress(state: RootState, address: string) {
      state.userDepositTokenAddress = address;
    },
    acceptDisclaimer(state: RootState, persistDecision: boolean) {
      state.disclaimerAccepted = true;
      state.persistDisclaimerAcceptance = persistDecision;
    }
  },
  actions: {},
  getters: {
    tokens: function(state: RootState): TokenModel[] {
      const reducer = (
        acc: AccTokenModel,
        channel: RaidenChannel
      ): AccTokenModel => {
        acc.address = channel.token;
        (acc[channel.state] as number) += 1;
        return acc;
      };

      return map(
        filter(flatMap(state.channels), channels => !isEmpty(channels)),
        tokenChannels => {
          const model = reduce(tokenChannels, reducer, emptyTokenModel());
          const tokenInfo = state.tokens[model.address];
          if (tokenInfo) {
            model.name = tokenInfo.name || '';
            model.symbol = tokenInfo.symbol || '';
          }

          return model;
        }
      );
    },
    allTokens: (state: RootState): Token[] =>
      Object.values(state.tokens)
        .filter(token => state.tokenAddresses.includes(token.address))
        .sort((a: Token, b: Token) => {
          if (hasNonZeroBalance(a, b)) {
            return (b.balance! as BigNumber).gt(a.balance! as BigNumber)
              ? 1
              : -1;
          }
          return a.symbol && b.symbol ? a.symbol.localeCompare(b.symbol) : 0;
        }),
    channels: (state: RootState) => (tokenAddress: string) => {
      let channels: RaidenChannel[] = [];
      const tokenChannels = state.channels[tokenAddress];
      if (tokenChannels && !isEmpty(tokenChannels)) {
        channels = flatMap(tokenChannels);
      }
      return channels;
    },
    openChannels: (state: RootState) => {
      return Object.keys(state.channels).length > 0;
    },
    token: (state: RootState) => (tokenAddress: string) => {
      if (tokenAddress in state.tokens) {
        return state.tokens[tokenAddress];
      } else {
        return null;
      }
    },
    network: (state: RootState) => {
      return getNetworkName(state.network);
    },
    mainnet: (state: RootState) => {
      return state.network.chainId === 1;
    },
    channelWithBiggestCapacity: (_, getters) => (tokenAddress: string) => {
      const channels: RaidenChannel[] = getters.channels(tokenAddress);
      const openChannels = channels.filter(
        value => value.state === ChannelState.open
      );
      return orderBy(openChannels, ['capacity'], ['desc'])[0];
    },
    pendingTransfers: ({ transfers }: RootState) =>
      Object.keys(transfers)
        .filter(key => {
          const { completed } = transfers[key];

          // return whether transfer is pending or not
          return !completed;
        })
        .reduce((pendingTransfers: Transfers, key: string) => {
          pendingTransfers[key] = transfers[key];
          return pendingTransfers;
        }, {}),
    transfer: (state: RootState) => (paymentId: BigNumber) => {
      return Object.values(state.transfers).find(transfer =>
        transfer.paymentId.eq(paymentId)
      );
    },
    isConnected: (state: RootState): boolean => {
      return (
        !state.loading &&
        !!(state.defaultAccount && state.defaultAccount !== '')
      );
    },
    udcToken: (state: RootState): Token => {
      return state.tokens[state.userDepositTokenAddress];
    },
    usingRaidenAccount: (state: RootState): boolean => {
      return !!state.settings.useRaidenAccount;
    }
  },
  plugins: [settingsLocalStorage.plugin, disclaimerAcceptedLocalStorage.plugin],
  modules: {
    notifications
  }
};

export default new Vuex.Store(store);
