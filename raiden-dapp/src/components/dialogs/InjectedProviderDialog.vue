<template>
  <raiden-dialog width="472" class="injected-provider" :visible="true" @close="emitCancel">
    <v-card-title>
      {{ $t('connection-manager.dialogs.wallet-connect-provider.header') }}
    </v-card-title>

    <v-card-text>
      <spinner v-if="linkingInProgress" />

      <v-alert
        v-if="linkingFailed"
        class="injected-provider__error-message text-left font-weight-light"
        color="error"
        icon="warning"
      >
        {{ $t('connection-manager.dialogs.injected-provider.error-message') }}
      </v-alert>
    </v-card-text>

    <v-card-actions>
      <action-button
        :enabled="!linkingInProgress"
        class="injected-provider__link-button"
        :text="$t('connection-manager.dialogs.injected-provider.link-button')"
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
import Spinner from '@/components/icons/Spinner.vue';
import EthereumProviderDialogMixin from '@/mixins/ethereum-provider-dialog-mixin';
import { InjectedProvider } from '@/services/ethereum-provider';

@Component({
  components: {
    ActionButton,
    RaidenDialog,
    Spinner,
  },
})
export default class InjectedProviderDialog extends Mixins(EthereumProviderDialogMixin) {
  providerFactory = InjectedProvider;
}
</script>
