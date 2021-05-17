<template>
  <ethereum-provider-base-dialog
    :header="$t('connection-manager.dialogs.injected-provider.header')"
    :can-link="canLink"
    :linking-in-progress="linkingInProgress"
    :linking-failed="linkingFailed"
    :error-message="$t('connection-manager.dialogs.injected-provider.error-message')"
    @link="link"
    @cancel="emitCancel"
  />
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';

import EthereumProviderBaseDialog from '@/components/dialogs/EthereumProviderBaseDialog.vue';
import EthereumProviderDialogMixin from '@/mixins/ethereum-provider-dialog-mixin';
import { InjectedProvider } from '@/services/ethereum-provider';

@Component({ components: { EthereumProviderBaseDialog } })
export default class InjectedProviderDialog extends Mixins(EthereumProviderDialogMixin) {
  providerFactory = InjectedProvider;
}
</script>
