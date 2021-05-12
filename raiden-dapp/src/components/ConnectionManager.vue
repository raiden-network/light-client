<template>
  <div class="connection-manager">
    <v-alert
      class="connection-manager__error-message font-weight-light"
      :class="{ 'connection-manager__error-message--hidden': !errorCode }"
      color="error"
      icon="warning"
    >
      {{ translatedErrorCode }}
    </v-alert>

    <template v-if="showProviderButtons">
      <action-button
        class="connection-manager__provider-dialog-button"
        :enabled="true"
        :text="$t('connection-manager.dialogs.wallet-connect-provider.header')"
        width="280px"
        @click="openWalletConnectProviderDialog"
      />
      <action-button
        class="connection-manager__provider-dialog-button"
        :enabled="true"
        :text="$t('connection-manager.dialogs.injected-provider.header')"
        width="280px"
        @click="openInjectedProviderDialog"
      />
    </template>

    <wallet-connect-provider-dialog
      v-if="walletConnectProviderDialogVisible"
      @linkEstablished="onProviderLinkEstablished"
      @cancel="closeWalletConnectProviderDialog"
    />
    <injected-provider-dialog
      v-if="injectedProviderDialogVisible"
      @linkEstablished="onProviderLinkEstablished"
      @cancel="closeInjectedProviderDialog"
    />

    <template v-if="inProgress">
      <connection-pending-dialog @reset-connection="resetConnection" />
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { createNamespacedHelpers, mapState } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import ConnectionPendingDialog from '@/components/dialogs/ConnectionPendingDialog.vue';
import InjectedProviderDialog from '@/components/dialogs/InjectedProviderDialog.vue';
import WalletConnectProviderDialog from '@/components/dialogs/WalletConnectProviderDialog.vue';
import { ErrorCode } from '@/model/types';
import { ConfigProvider } from '@/services/config-provider';
import type { EthereumProvider } from '@/services/ethereum-provider';
import { DirectRpcProvider } from '@/services/ethereum-provider';

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
    InjectedProviderDialog,
    WalletConnectProviderDialog,
  },
})
export default class ConnectionManager extends Vue {
  isConnected!: boolean;
  stateBackup!: string;
  useRaidenAccount!: boolean;

  walletConnectProviderDialogVisible = false;
  injectedProviderDialogVisible = false;
  inProgress = false;
  errorCode: ErrorCode | null = null;

  get showProviderButtons(): boolean {
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

  /**
   * This is a workaround to make the end-to-end tests working while the
   * connection manager does not support user configured direct RPC provider
   * connections.
   */
  async created(): Promise<void> {
    const { rpc_endpoint: rpcUrl, private_key: privateKey } = await ConfigProvider.configuration();

    if (rpcUrl && privateKey) {
      const provider = await DirectRpcProvider.link({ rpcUrl, privateKey });
      this.connect(provider);
    }
  }

  openWalletConnectProviderDialog(): void {
    this.walletConnectProviderDialogVisible = true;
  }

  closeWalletConnectProviderDialog(): void {
    this.walletConnectProviderDialogVisible = false;
  }

  openInjectedProviderDialog(): void {
    this.injectedProviderDialogVisible = true;
  }

  closeInjectedProviderDialog(): void {
    this.injectedProviderDialogVisible = false;
  }

  closeAllProviderDialogs(): void {
    this.closeWalletConnectProviderDialog();
    this.closeInjectedProviderDialog();
  }

  async onProviderLinkEstablished(linkedProvider: EthereumProvider): Promise<void> {
    this.closeAllProviderDialogs();
    await this.connect(linkedProvider);
  }

  async connect(provider: EthereumProvider): Promise<void> {
    if (this.isConnected || this.inProgress) {
      // Nobody catches this error. But if this case occurs, this is an
      // implementation error that should show up in the console and tests.
      throw new Error('Can only connect once!');
    }

    this.inProgress = true;
    this.errorCode = null;
    this.$store.commit('reset');

    const configuration = await ConfigProvider.configuration();
    const useRaidenAccount = this.useRaidenAccount ? true : undefined;
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
        this.stateBackup,
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

  resetConnection(): void {
    localStorage.removeItem('walletconnect');
    // There is no clean way to cancel the asynchronous connection function, therefore reload page.
    window.location.replace(window.location.origin);
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/mixins';

.connection-manager {
  font-size: 16px;
  line-height: 20px;

  &__error-message {
    min-height: 70px;

    &--hidden {
      visibility: hidden; // Make sure it still takes its height to avoid jumping

      @include respond-to(handhelds) {
        display: none;
      }
    }
  }

  &__provider-dialog-button {
    margin: 20px 0;

    @include respond-to(handhelds) {
      margin: 10px 0;
    }
  }
}
</style>
