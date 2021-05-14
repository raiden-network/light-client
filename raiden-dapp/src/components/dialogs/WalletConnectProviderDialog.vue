<template>
  <raiden-dialog width="472" class="wallet-connect-provider" :visible="true" @close="emitCancel">
    <v-card-title>
      {{ $t('connection-manager.dialogs.wallet-connect-provider.header') }}
    </v-card-title>

    <v-card-text>
      <text-input-with-toggle
        v-model="bridgeUrlOption"
        class="wallet-connect-provider__options__bridge-url"
        :name="$t('connection-manager.dialogs.wallet-connect-provider.options.bridge-url.name')"
        :details="
          $t('connection-manager.dialogs.wallet-connect-provider.options.bridge-url.details')
        "
        :placeholder="
          $t('connection-manager.dialogs.wallet-connect-provider.options.bridge-url.placeholder')
        "
        optional
      />

      <v-btn-toggle mandatory>
        <v-btn class="wallet-connect-provider__option-toggle-button" @click="showInfuraIdOption">
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.infura-id.name') }}
        </v-btn>
        <v-btn class="wallet-connect-provider__option-toggle-button" @click="showRpcUrlOption">
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.name') }}
        </v-btn>
      </v-btn-toggle>

      <text-input-with-toggle
        v-if="infuraIdOptionVisible"
        v-model="infuraIdOption"
        class="wallet-connect-provider__options__infura-id"
        :name="$t('connection-manager.dialogs.wallet-connect-provider.options.infura-id.name')"
        :details="
          $t('connection-manager.dialogs.wallet-connect-provider.options.infura-id.details')
        "
        :placeholder="
          $t('connection-manager.dialogs.wallet-connect-provider.options.infura-id.placeholder')
        "
      />

      <text-input-with-toggle
        v-if="rpcUrlOptionVisible"
        v-model="rpcUrlOption"
        class="wallet-connect-provider__options__rpc-url"
        :name="$t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.name')"
        :details="$t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.details')"
        :placeholder="
          $t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.placeholder')
        "
      />

      <v-alert
        v-if="linkFailed"
        class="wallet-connect-provider__error-message text-left font-weight-light"
        color="error"
        icon="warning"
      >
        {{ $t('connection-manager.dialogs.wallet-connect-provider.error-message') }}
      </v-alert>
    </v-card-text>

    <v-card-actions>
      <action-button
        :enabled="canLink"
        class="wallet-connect-provider__link-button"
        :text="$t('connection-manager.dialogs.wallet-connect-provider.link-button')"
        width="200px"
        @click="link"
      />
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';
import { createNamespacedHelpers } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import TextInputWithToggle from '@/components/TextInputWithToggle.vue';
import { WalletConnectProvider } from '@/services/ethereum-provider';

enum OptionToggle {
  INFURA_ID,
  RPC_URL,
}

type WalletConnectProviderOptions = Parameters<typeof WalletConnectProvider.link>[0];

const { mapGetters, mapMutations } = createNamespacedHelpers('userSettings');

@Component({
  components: {
    ActionButton,
    TextInputWithToggle,
    RaidenDialog,
  },
  methods: {
    ...mapGetters(['getEthereumProviderOptions']),
    ...mapMutations(['saveEthereumProviderOptions']),
  },
})
export default class WalletConnectProviderDialog extends Vue {
  bridgeUrlOption = '';
  infuraIdOption = '';
  rpcUrlOption = '';
  optionToggleState = OptionToggle.INFURA_ID;
  linkFailed = false;

  getEthereumProviderOptions!: () => (providerName: string) => WalletConnectProviderOptions;
  saveEthereumProviderOptions!: (payload: {
    providerName: string;
    providerOptions: WalletConnectProviderOptions;
  }) => void;

  get infuraIdOptionVisible(): boolean {
    return this.optionToggleState === OptionToggle.INFURA_ID;
  }

  get rpcUrlOptionVisible(): boolean {
    return this.optionToggleState === OptionToggle.RPC_URL;
  }

  get canLink(): boolean {
    return !!this.infuraIdOption || !!this.rpcUrlOption;
  }

  get providerOptions(): WalletConnectProviderOptions {
    let options: WalletConnectProviderOptions;

    // We can't simply pass all options to the provider. In case the user
    // specified an Infura ID **and** a RPC URL, the linking would fail.
    switch (this.optionToggleState) {
      case OptionToggle.INFURA_ID:
        options = { infuraId: this.infuraIdOption };
        break;

      case OptionToggle.RPC_URL:
        options = { rpcUrl: this.rpcUrlOption };
        break;
    }

    if (this.bridgeUrlOption) {
      options.bridgeUrl = this.bridgeUrlOption;
    }

    return options;
  }

  created(): void {
    this.loadSavedProviderOptions();
  }

  showInfuraIdOption(): void {
    this.optionToggleState = OptionToggle.INFURA_ID;
  }

  showRpcUrlOption(): void {
    this.optionToggleState = OptionToggle.RPC_URL;
  }

  hideErrorMessage(): void {
    this.linkFailed = false;
  }

  loadSavedProviderOptions(): void {
    const savedProviderOptions = this.getEthereumProviderOptions()(
      WalletConnectProvider.providerName,
    );
    this.bridgeUrlOption = savedProviderOptions.bridgeUrl ?? '';
    this.infuraIdOption = savedProviderOptions.infuraId ?? '';
    this.rpcUrlOption = savedProviderOptions.rpcUrl ?? '';

    if (!this.infuraIdOption && this.rpcUrlOption) {
      this.showRpcUrlOption();
    }
  }

  saveProviderOptions(): void {
    this.saveEthereumProviderOptions({
      providerName: WalletConnectProvider.providerName,
      providerOptions: this.providerOptions,
    });
  }

  async link(): Promise<void> {
    this.linkFailed = false;

    try {
      const provider = await WalletConnectProvider.link(this.providerOptions);
      this.saveProviderOptions();
      this.emitLinkEstablished(provider);
    } catch {
      this.linkFailed = true;
    }
  }

  @Emit('linkEstablished')
  emitLinkEstablished(linkedProvider: WalletConnectProvider): WalletConnectProvider {
    return linkedProvider;
  }

  @Emit('cancel')
  emitCancel(): void {
    this.saveProviderOptions();
  }
}
</script>

<style lang="scss" scoped>
.wallet-connect-provider {
  &__option-toggle-button {
    width: 92px;
  }
}
</style>
