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
        :enabled="injectedProviderAvailable"
        :text="$t('connection-manager.dialogs.injected-provider.header')"
        width="280px"
        @click="openInjectedProviderDialog"
      />
      <action-button
        class="connection-manager__provider-dialog-button"
        :enabled="walletConnectProviderAvailable"
        :text="$t('connection-manager.dialogs.wallet-connect-provider.header')"
        width="280px"
        @click="openWalletConnectProviderDialog"
      />
      <action-button
        class="connection-manager__provider-dialog-button"
        data-cy="connection-manager__provider-dialog-button"
        :enabled="directRpcProviderAvailable"
        :text="$t('connection-manager.dialogs.direct-rpc-provider.header')"
        width="280px"
        @click="openDirectRpcProviderDialog"
      />
    </template>

    <injected-provider-dialog
      v-if="injectedProviderDialogVisible"
      @linkEstablished="onProviderLinkEstablished"
      @cancel="closeInjectedProviderDialog"
    />

    <wallet-connect-provider-dialog
      v-if="walletConnectProviderDialogVisible"
      @linkEstablished="onProviderLinkEstablished"
      @cancel="closeWalletConnectProviderDialog"
    />

    <direct-rpc-provider-dialog
      v-if="directRpcProviderDialogVisible"
      @linkEstablished="onProviderLinkEstablished"
      @cancel="closeDirectRpcProviderDialog"
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
import DirectRpcProviderDialog from '@/components/dialogs/DirectRpcProviderDialog.vue';
import InjectedProviderDialog from '@/components/dialogs/InjectedProviderDialog.vue';
import WalletConnectProviderDialog from '@/components/dialogs/WalletConnectProviderDialog.vue';
import { ErrorCode } from '@/model/types';
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
    DirectRpcProviderDialog,
    InjectedProviderDialog,
    WalletConnectProviderDialog,
  },
})
export default class ConnectionManager extends Vue {
  isConnected!: boolean;
  stateBackup!: string;
  useRaidenAccount!: boolean;

  injectedProviderDialogVisible = false;
  walletConnectProviderDialogVisible = false;
  directRpcProviderDialogVisible = false;
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

  get injectedProviderAvailable(): boolean {
    return InjectedProvider.isAvailable;
  }

  get walletConnectProviderAvailable(): boolean {
    return WalletConnectProvider.isAvailable;
  }

  get directRpcProviderAvailable(): boolean {
    return DirectRpcProvider.isAvailable;
  }

  openInjectedProviderDialog(): void {
    this.injectedProviderDialogVisible = true;
  }

  closeInjectedProviderDialog(): void {
    this.injectedProviderDialogVisible = false;
  }

  openWalletConnectProviderDialog(): void {
    this.walletConnectProviderDialogVisible = true;
  }

  closeWalletConnectProviderDialog(): void {
    this.walletConnectProviderDialogVisible = false;
  }

  openDirectRpcProviderDialog(): void {
    this.directRpcProviderDialogVisible = true;
  }

  closeDirectRpcProviderDialog(): void {
    this.directRpcProviderDialogVisible = false;
  }

  closeAllProviderDialogs(): void {
    this.closeInjectedProviderDialog();
    this.closeWalletConnectProviderDialog();
    this.closeDirectRpcProviderDialog();
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
    margin: 0 90px;

    @include respond-to(handhelds) {
      margin: 0 10px;
    }

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
