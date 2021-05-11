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
        :enabled="true"
        text="Wallet Connect"
        width="280px"
        @click="openWalletConnectDialog"
      />
      <wallet-connect-provider-dialog
        v-if="walletConnectDialogVisible"
        @linkEstablished="onProviderLinkEstablished"
        @cancel="closeWalletConnectDialog"
      />
    </template>

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
import WalletConnectProviderDialog from '@/components/dialogs/WalletConnectProviderDialog.vue';
import { ErrorCode } from '@/model/types';
import { ConfigProvider } from '@/services/config-provider';
import type { EthereumProvider } from '@/services/ethereum-provider';

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
    WalletConnectProviderDialog,
  },
})
export default class ConnectionManager extends Vue {
  isConnected!: boolean;
  stateBackup!: string;
  useRaidenAccount!: boolean;

  walletConnectDialogVisible = false;
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

  async onProviderLinkEstablished(linkedProvider: EthereumProvider): Promise<void> {
    await this.connect(linkedProvider);
  }

  openWalletConnectDialog(): void {
    this.walletConnectDialogVisible = true;
  }

  closeWalletConnectDialog(): void {
    this.walletConnectDialogVisible = false;
  }

  async connect(provider: EthereumProvider): Promise<void> {
    if (this.isConnected || this.inProgress) {
      // Nobody catches this error. But if this case occurs, this is an
      // implementation error that should show up in the console and tests.
      throw new Error('Can only connect once!');
    }

    this.inProgress = true;
    this.$store.commit('reset');
    this.errorCode = null;

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
}
</style>
