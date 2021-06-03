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
      <template v-for="(providerEntry, providerName) in providerList">
        <action-button
          v-if="!isProviderDisabled(providerName)"
          :key="'button_' + providerName"
          class="connection-manager__provider-dialog-button"
          :data-cy="'connection-manager__provider-dialog-button__' + providerName"
          :enabled="providerEntry.factory.isAvailable"
          :text="$t(providerEntry.buttonText)"
          width="280px"
          @click="openProviderDialog(providerName)"
        />
      </template>
    </template>

    <template v-for="(providerEntry, providerName) in providerList">
      <component
        :is="providerEntry.dialogComponent"
        v-if="isProviderDialogVisible(providerName)"
        :key="'dialog_' + providerName"
        @linkEstablished="onProviderLinkEstablished"
        @cancel="closeProviderDialog(providerName)"
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
import { ErrorCode } from '@/model/types';
import { ConfigProvider } from '@/services/config-provider';
import type { EthereumProvider, EthereumProviderFactory } from '@/services/ethereum-provider';
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

interface ProviderListEntry {
  factory: EthereumProviderFactory;
  buttonText: string;
  dialogComponent: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type ProviderList = { [providerName: string]: ProviderListEntry };

const providerList: ProviderList = {
  [InjectedProvider.providerName]: {
    factory: InjectedProvider,
    buttonText: 'connection-manager.dialogs.injected-provider.header',
    dialogComponent: () => import('@/components/dialogs/InjectedProviderDialog.vue'),
  },
  [WalletConnectProvider.providerName]: {
    factory: WalletConnectProvider,
    buttonText: 'connection-manager.dialogs.wallet-connect-provider.header',
    dialogComponent: () => import('@/components/dialogs/WalletConnectProviderDialog.vue'),
  },
  [DirectRpcProvider.providerName]: {
    factory: DirectRpcProvider,
    buttonText: 'connection-manager.dialogs.direct-rpc-provider.header',
    dialogComponent: () => import('@/components/dialogs/DirectRpcProviderDialog.vue'),
  },
};

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
  providerList: ProviderList = providerList;
  providerDialogOpenState: { [providerName: string]: boolean } = Object.fromEntries(
    Object.keys(this.providerList).map((name) => [name, false] as const),
  );

  providerDisabledState: { [providerName: string]: boolean } = Object.fromEntries(
    Object.keys(this.providerList).map((name) => [name, true] as const),
  );

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

  isProviderDisabled(providerName: string): boolean {
    return this.providerDisabledState[providerName] ?? true;
  }

  isProviderDialogVisible(providerName: string): boolean {
    return this.providerDialogOpenState[providerName] ?? false;
  }

  openProviderDialog(providerName: string): void {
    this.providerDialogOpenState[providerName] = true;
  }

  closeProviderDialog(providerName: string): void {
    this.providerDialogOpenState[providerName] = false;
  }

  created(): void {
    this.checkForDisabledProviders();
  }

  async checkForDisabledProviders(): Promise<void> {
    for (const [providerName, providerEntry] of Object.entries(this.providerList)) {
      providerEntry.factory.isDisabled().then((disabled) => {
        this.providerDisabledState[providerName] = disabled;
      });
    }
  }

  closeAllProviderDialogs(): void {
    this.providerDialogOpenState = Object.fromEntries(
      Object.keys(this.providerDialogOpenState).map((name) => [name, false] as const),
    );
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
  display: flex;
  flex-direction: column;
  align-items: center;
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
    margin: 10px 0;
  }
}
</style>
