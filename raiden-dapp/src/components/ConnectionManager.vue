<template>
  <div class="connection-manager">
    <v-alert
      v-if="errorCode"
      id="connection-manager__error-message"
      class="font-weight-light"
      color="error"
      icon="warning"
    >
      {{ translatedErrorCode }}
    </v-alert>

    <action-button
      :enabled="connectButtonEnabled"
      :text="$t('connection-manager.connect-button')"
      :loading="inProgress"
      :loading-text="$t('connection-manager.connect-button-loading')"
      sticky
      @click="connect"
    />

    <connection-pending-dialog v-if="inProgress" @reset-connection="resetConnection" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { createNamespacedHelpers, mapState } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import ConnectionPendingDialog from '@/components/dialogs/ConnectionPendingDialog.vue';
import { ErrorCode } from '@/model/types';
import type { Configuration } from '@/services/config-provider';
import { ConfigProvider } from '@/services/config-provider';
import type { EthereumProvider } from '@/services/ethereum-provider';
import {
  DirectRpcProvider,
  InjectedProvider,
  WalletConnectProvider,
} from '@/services/ethereum-provider';

function mapRaidenServiceErrorToErrorCode(error: Error): ErrorCode {
  if (error.message && error.message.includes('No deploy info provided')) {
    return ErrorCode.UNSUPPORTED_NETWORK;
  } else if (error.message && error.message.includes('Could not replace stored state')) {
    return ErrorCode.STATE_MIGRATION_FAILED;
  } else {
    return ErrorCode.SDK_INITIALIZATION_FAILED;
  }
}

const { mapState: mapUserSettingsState } = createNamespacedHelpers('userSettings');

@Component({
  computed: {
    ...mapState(['isConnected', 'stateBackup']),
    ...mapUserSettingsState(['useRaidenAccount']),
  },
  components: {
    ActionButton,
    ConnectionPendingDialog,
  },
})
export default class ConnectionManager extends Vue {
  isConnected!: boolean;
  stateBackup!: string;
  useRaidenAccount!: boolean;

  inProgress = false;
  errorCode: ErrorCode | null = null;

  get connectButtonEnabled(): boolean {
    return !this.isConnected && !this.inProgress;
  }

  get translatedErrorCode(): string {
    if (!this.errorCode) {
      return '';
    } else {
      const translationKey = `error-codes.${this.errorCode.toString()}`;
      return this.$t(translationKey) as string;
    }
  }

  async connect() {
    this.inProgress = true;
    this.$store.commit('reset');
    this.errorCode = null;

    const stateBackup = this.stateBackup;
    const configuration = await ConfigProvider.configuration();
    const useRaidenAccount = this.useRaidenAccount ? true : undefined;
    const provider = await this.getProvider(configuration);

    // TODO: This will become removed when the provider options are controlled by the user.
    if (provider === undefined) {
      this.errorCode = ErrorCode.NO_ETHEREUM_PROVIDER;
      this.inProgress = false;
      return;
    }

    const network = await provider.provider.getNetwork();

    if (network.chainId === 1 && process.env.VUE_APP_ALLOW_MAINNET !== 'true') {
      this.errorCode = ErrorCode.UNSUPPORTED_NETWORK;
      this.inProgress = false;
      return;
    }

    try {
      await this.$raiden.connect(
        provider.provider,
        provider.account,
        stateBackup,
        configuration.per_network,
        useRaidenAccount,
      );
    } catch (error) {
      this.errorCode = mapRaidenServiceErrorToErrorCode(error);
      this.inProgress = false;
      return;
    }

    this.$store.commit('setConnected');
    this.$store.commit('clearBackupState');
  }

  async getProvider(configuration: Configuration): Promise<EthereumProvider | undefined> {
    const {
      rpc_endpoint: rpcUrl,
      private_key: privateKey,
      rpc_endpoint_wallet_connect: rpcUrlWalletConnect,
    } = configuration;

    if (rpcUrl && privateKey) {
      return await DirectRpcProvider.link({ rpcUrl, privateKey });
    } else if (!!window.ethereum || !!window.web3) {
      return await InjectedProvider.link();
    } else if (rpcUrlWalletConnect) {
      return await WalletConnectProvider.link({ rpcUrl: rpcUrlWalletConnect });
    } else {
      return undefined;
    }
  }

  resetConnection(): void {
    localStorage.removeItem('walletconnect');
    // There is no clean way to cancel the asynchronous connection function, therefore reload page.
    window.location.replace(window.location.origin);
  }
}
</script>

<style lang="scss" scoped>
.connection-manager {
  font-size: 16px;
  line-height: 20px;
}
</style>
