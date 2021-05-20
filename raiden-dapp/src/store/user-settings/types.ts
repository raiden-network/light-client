import type { EthereumProviderOptions } from '@/services/ethereum-provider';

export interface UserSettingsState {
  useRaidenAccount: boolean;
  ethereumProviderOptions: { [providerName: string]: EthereumProviderOptions };
}

export type UserSettingsGetters<S = UserSettingsState> = {
  getEthereumProviderOptions(state: S): (providerName: string) => EthereumProviderOptions;
};

export type UserSettingsMutations<S = UserSettingsState> = {
  enableRaidenAccount(state: S): void;
  disableRaidenAccount(state: S): void;
  saveEthereumProviderOptions(
    state: S,
    payload: { providerName: string; providerOptions: EthereumProviderOptions },
  ): void;
};
