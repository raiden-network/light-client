<template>
  <raiden-dialog width="472" class="injected-provider" :visible="true" @close="emitCancel">
    <v-card-title>
      {{ $t('connection-manager.dialogs.wallet-connect-provider.header') }}
    </v-card-title>

    <v-card-text>
      <spinner v-if="inProgress" />

      <v-alert
        v-if="linkFailed"
        class="injected-provider__error-message text-left font-weight-light"
        color="error"
        icon="warning"
      >
        {{ $t('connection-manager.dialogs.injected-provider.error-message') }}
      </v-alert>
    </v-card-text>

    <v-card-actions>
      <action-button
        :enabled="!inProgress"
        class="injected-provider__link-button"
        :text="$t('connection-manager.dialogs.injected-provider.link-button')"
        width="200px"
        @click="link"
      />
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';
import { InjectedProvider } from '@/services/ethereum-provider';

@Component({
  components: {
    ActionButton,
    RaidenDialog,
    Spinner,
  },
})
export default class WalletConnectProviderDialog extends Vue {
  linkFailed = false;
  inProgress = false;

  async link(): Promise<void> {
    this.linkFailed = false;
    this.inProgress = true;

    try {
      const provider = await InjectedProvider.link();
      this.emitLinkEstablished(provider);
    } catch {
      this.linkFailed = true;
      this.inProgress = false;
    }
  }

  @Emit('linkEstablished')
  emitLinkEstablished(linkedProvider: InjectedProvider): InjectedProvider {
    return linkedProvider;
  }

  @Emit('cancel')
  emitCancel(): void {
    // pass
  }
}
</script>
