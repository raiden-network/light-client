import type { EthereumProviderOptions } from '@/services/ethereum-provider';

export interface UserSettingsState {
  useRaidenAccount: boolean;
  ethereumProviderOptions: { [providerName: string]: EthereumProviderOptions };
}
