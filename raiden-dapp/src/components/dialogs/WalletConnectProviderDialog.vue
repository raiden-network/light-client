<template>
  <raiden-dialog width="472" class="wallet-connect-provider" :visible="true" @close="emitCancel">
    <v-card-title>
      {{ $t('connection-manager.dialogs.wallet-connect-provider.header') }}
    </v-card-title>

    <v-card-text>
      <text-input-with-toggle
        v-model="bridgeUrl"
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
        v-model="infuraId"
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
        v-model="rpcUrl"
        class="wallet-connect-provider__options__rpc-url"
        :name="$t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.name')"
        :details="$t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.details')"
        :placeholder="
          $t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.placeholder')
        "
      />

      <v-alert
        v-if="linkingFailed"
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
import { Component, Mixins } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import TextInputWithToggle from '@/components/TextInputWithToggle.vue';
import EthereumProviderDialogMixin from '@/mixins/ethereum-provider-dialog-mixin';
import { WalletConnectProvider } from '@/services/ethereum-provider';

enum OptionToggle {
  INFURA_ID,
  RPC_URL,
}

type WalletConnectProviderOptions = Parameters<typeof WalletConnectProvider.link>[0];

@Component({
  components: {
    ActionButton,
    TextInputWithToggle,
    RaidenDialog,
  },
})
export default class WalletConnectProviderDialog extends Mixins(EthereumProviderDialogMixin) {
  providerFactory = WalletConnectProvider;
  bridgeUrl = '';
  infuraId = '';
  rpcUrl = '';
  optionToggleState = OptionToggle.INFURA_ID;

  get infuraIdOptionVisible(): boolean {
    return this.optionToggleState === OptionToggle.INFURA_ID;
  }

  get rpcUrlOptionVisible(): boolean {
    return this.optionToggleState === OptionToggle.RPC_URL;
  }

  get canLink(): boolean {
    return !!this.infuraId || !!this.rpcUrl;
  }

  get providerOptions(): WalletConnectProviderOptions {
    let options: WalletConnectProviderOptions;

    // We can't simply pass all options to the provider. In case the user
    // specified an Infura ID **and** a RPC URL, the linking would fail.
    switch (this.optionToggleState) {
      case OptionToggle.INFURA_ID:
        options = { infuraId: this.infuraId };
        break;

      case OptionToggle.RPC_URL:
        options = { rpcUrl: this.rpcUrl };
        break;
    }

    if (this.bridgeUrl) {
      options.bridgeUrl = this.bridgeUrl;
    }

    return options;
  }

  created(): void {
    this.switchOptionToggleIfNecessary();
  }

  switchOptionToggleIfNecessary(): void {
    if (!this.infuraId && this.rpcUrl) {
      this.showRpcUrlOption();
    }
  }

  showInfuraIdOption(): void {
    this.optionToggleState = OptionToggle.INFURA_ID;
  }

  showRpcUrlOption(): void {
    this.optionToggleState = OptionToggle.RPC_URL;
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
