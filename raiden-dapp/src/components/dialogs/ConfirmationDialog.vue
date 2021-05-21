<template>
  <raiden-dialog class="confirmation" :visible="visible" @close="cancel">
    <v-card-title>
      <slot name="header" />
    </v-card-title>

    <v-card-text>
      <slot />
    </v-card-text>

    <v-card-actions>
      <action-button
        :id="`confirm-${identifier}`"
        class="confirmation__button"
        :enabled="true"
        :text="positiveAction"
        full-width
        @click="confirm()"
      />
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';

@Component({
  components: {
    RaidenDialog,
    ActionButton,
  },
})
export default class ConfirmationDialog extends Vue {
  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;
  @Prop({ required: true })
  positiveAction!: string;
  @Prop({ required: true })
  identifier!: number;

  @Emit()
  cancel(): boolean {
    return true;
  }

  @Emit()
  confirm(): boolean {
    return true;
  }
}
</script>
