<template>
  <raiden-dialog class="confirmation" :visible="visible" @close="cancel">
    <v-card-title>
      <span>
        <slot name="header"></slot>
      </span>
    </v-card-title>

    <v-card-text>
      <slot></slot>
    </v-card-text>

    <v-card-actions>
      <action-button
        :id="`confirm-${identifier}`"
        :enabled="true"
        :text="positiveAction"
        @click="confirm()"
      >
      </action-button>
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
    ActionButton
  }
})
export default class ConfirmationDialog extends Vue {
  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;
  @Prop({ required: true })
  positiveAction!: string;
  @Prop({ required: true })
  identifier!: number;

  @Emit()
  cancel() {}
  @Emit()
  confirm() {}
}
</script>

<style scoped lang="scss"></style>
