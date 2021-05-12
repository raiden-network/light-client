<template>
  <raiden-dialog width="472" class="wallet-connect-provider" :visible="true" @close="emitCancel">
    <v-card-title>
      {{ $t('connection-manager.dialogs.wallet-connect-provider.header') }}
    </v-card-title>

    <v-card-text>
      <div class="wallet-connect-provider__options__bridge-url">
        <h3>
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.bridge-url.header') }}
        </h3>
        <span>
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.bridge-url.details') }}
        </span>
        <v-switch
          class="wallet-connect-provider__options__bridge-url__toggle"
          @change="toggleBridgeUrlOption"
        />
        <input
          v-model.trim="bridgeUrlOption"
          class="wallet-connect-provider__input wallet-connect-provider__options__bridge-url__input"
          :disabled="bridgeUrlOptionDisabled"
          :placeholder="
            $t('connection-manager.dialogs.wallet-connect-provider.options.bridge-url.placeholder')
          "
          @input="hideErrorMessage"
        />
      </div>

      <v-btn-toggle mandatory>
        <v-btn class="wallet-connect-provider__option-toggle-button" @click="showInfuraIdOption">
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.infura-id.header') }}
        </v-btn>
        <v-btn class="wallet-connect-provider__option-toggle-button" @click="showRpcUrlOption">
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.header') }}
        </v-btn>
      </v-btn-toggle>

      <div v-if="infuraIdOptionVisible" class="wallet-connect-provider__options__infura-id">
        <h3>
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.infura-id.header') }}
        </h3>
        <span>
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.infura-id.details') }}
        </span>
        <input
          v-model.trim="infuraIdOption"
          class="wallet-connect-provider__input wallet-connect-provider__options__infura-id__input"
          :placeholder="
            $t('connection-manager.dialogs.wallet-connect-provider.options.infura-id.placeholder')
          "
          @input="hideErrorMessage"
        />
      </div>

      <div v-if="rpcUrlOptionVisible" class="wallet-connect-provider__options__rpc-url">
        <h3>
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.header') }}
        </h3>
        <span>
          {{ $t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.details') }}
        </span>
        <input
          v-model.trim="rpcUrlOption"
          class="wallet-connect-provider__input wallet-connect-provider__options__rpc-url__input"
          :placeholder="
            $t('connection-manager.dialogs.wallet-connect-provider.options.rpc-url.placeholder')
          "
          @input="hideErrorMessage"
        />
      </div>

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
import { WalletConnectProvider } from '@/services/ethereum-provider';

enum OptionToggle {
  INFURA_ID,
  RPC_URL,
}

type WalletConnectProviderOptions = Parameters<typeof WalletConnectProvider.link>[0];

const { mapGetters, mapMutations } = createNamespacedHelpers('userSettings');

@Component({
  components: {
    RaidenDialog,
    ActionButton,
  },
  methods: {
    ...mapGetters(['getEthereumProviderOptions']),
    ...mapMutations(['saveEthereumProviderOptions']),
  },
})
export default class WalletConnectProviderDialog extends Vue {
  bridgeUrlOption = '';
  bridgeUrlOptionDisabled = true;
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

  toggleBridgeUrlOption(): void {
    this.bridgeUrlOptionDisabled = !this.bridgeUrlOptionDisabled;
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
@import '@/scss/mixins';
@import '@/scss/colors';

.wallet-connect-provider {
  // TODO: This is not nice. We need to get rid of it.
  &__input {
    background-color: $input-background;
    border-radius: 8px;
    color: $color-gray;
    height: 36px;
    margin-top: 8px;
    padding: 8px 8px 8px 16px;
    width: 100%;

    &:disabled {
      opacity: 30%;
    }
  }

  &__options {
    &__bridge-url,
    &__infura-id,
    &__rpc-url {
      display: flex;
      flex-direction: column;
      align-items: start;
      color: $color-gray;
      background-color: $input-background;
      border-radius: 8px !important;
      font-size: 14px;
      text-align: left;
      margin: 20px 0;
      padding: 16px;

      @include respond-to(handhelds) {
        margin: 10px 0;
      }
    }

    &__bridge-url {
      position: relative;

      &__toggle {
        position: absolute;
        top: 0;
        right: 10px;
        height: 32px;
      }
    }
  }

  &__option-toggle-button {
    width: 92px;
  }
}
</style>
