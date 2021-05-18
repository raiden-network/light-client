<template>
  <raiden-dialog
    class="ethereum-provider-base-dialog"
    width="472"
    :visible="true"
    @close="emitCancel"
  >
    <v-card-title class="ethereum-provider-base-dialog__header">{{ header }}</v-card-title>

    <v-card-text>
      <slot v-if="!linkingInProgress" />

      <spinner v-if="linkingInProgress" />

      <v-alert
        v-if="linkingFailed"
        class="ethereum-provider-base-dialog__error text-left font-weight-light"
        color="error"
        icon="warning"
      >
        {{ errorMessage }}
      </v-alert>
    </v-card-text>

    <v-card-actions>
      <action-button
        data-cy="ethereum-provider-base-dialog__button"
        :enabled="buttonEnabled"
        :text="$t('connection-manager.dialogs.base.link-button')"
        width="200px"
        @click="emitLink"
      />
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';

@Component({
  components: {
    ActionButton,
    RaidenDialog,
    Spinner,
  },
})
export default class EthereumProviderBaseDialog extends Vue {
  @Prop({ type: String, required: true })
  header!: string;

  @Prop({ type: Boolean, required: true })
  canLink!: boolean;

  @Prop({ type: Boolean, required: true })
  linkingInProgress!: boolean;

  @Prop({ type: Boolean, required: true })
  linkingFailed!: boolean;

  @Prop({ type: String, required: true })
  errorMessage!: string;

  get buttonEnabled(): boolean {
    return this.canLink && !this.linkingInProgress;
  }

  @Emit('cancel')
  emitCancel(): void {
    // pass
  }

  @Emit('link')
  emitLink(): void {
    // pass
  }
}
</script>
