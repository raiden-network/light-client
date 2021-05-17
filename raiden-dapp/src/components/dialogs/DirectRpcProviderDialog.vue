<template>
  <ethereum-provider-base-dialog
    :header="$t('connection-manager.dialogs.direct-rpc-provider.header')"
    :can-link="canLink"
    :linking-in-progress="linkingInProgress"
    :linking-failed="linkingFailed"
    :error-message="$t('connection-manager.dialogs.direct-rpc-provider.error-message')"
    @link="link"
    @cancel="emitCancel"
  >
    <text-input-with-toggle
      v-model="rpcUrl"
      class="direct-rpc-provider__options__rpc-url"
      :name="$t('connection-manager.dialogs.direct-rpc-provider.options.rpc-url.name')"
      :details="$t('connection-manager.dialogs.direct-rpc-provider.options.rpc-url.details')"
      :placeholder="
        $t('connection-manager.dialogs.direct-rpc-provider.options.rpc-url.placeholder')
      "
    />

    <text-input-with-toggle
      v-model="privateKey"
      class="direct-rpc-provider__options__private-key"
      :name="$t('connection-manager.dialogs.direct-rpc-provider.options.private-key.name')"
      :details="$t('connection-manager.dialogs.direct-rpc-provider.options.private-key.details')"
      :placeholder="
        $t('connection-manager.dialogs.direct-rpc-provider.options.private-key.placeholder')
      "
    />
  </ethereum-provider-base-dialog>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';

import EthereumProviderBaseDialog from '@/components/dialogs/EthereumProviderBaseDialog.vue';
import TextInputWithToggle from '@/components/TextInputWithToggle.vue';
import EthereumProviderDialogMixin from '@/mixins/ethereum-provider-dialog-mixin';
import { DirectRpcProvider } from '@/services/ethereum-provider';

type DirectRpcProviderOptions = Parameters<typeof DirectRpcProvider.link>[0];

@Component({
  components: {
    EthereumProviderBaseDialog,
    TextInputWithToggle,
  },
})
export default class WalletConnectProviderDialog extends Mixins(EthereumProviderDialogMixin) {
  providerFactory = DirectRpcProvider;
  rpcUrl = '';
  privateKey = '';

  get canLink(): boolean {
    return !!this.rpcUrl && !!this.privateKey;
  }

  get providerOptions(): DirectRpcProviderOptions {
    return {
      rpcUrl: this.rpcUrl,
      privateKey: this.privateKey,
    };
  }
}
</script>
