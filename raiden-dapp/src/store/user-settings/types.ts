import type { EthereumConnectionOptions } from '@/services/ethereum-connection';

export interface UserSettingsState {
  useRaidenAccount: boolean;
  ethereumConnectionOptions: { [connectionName: string]: EthereumConnectionOptions };
}
