<template>
  <raiden-dialog :visible="visible" class="confirmation-dialog" @close="cancel">
    <v-card-title><slot name="header"></slot></v-card-title>
    <v-card-text>
      <slot></slot>
    </v-card-text>
    <v-card-actions>
      <action-button
        sticky
        arrow
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
import RaidenDialog from '@/components/RaidenDialog.vue';
import ActionButton from '@/components/ActionButton.vue';

@Component({ components: { RaidenDialog, ActionButton } })
export default class Confirmation extends Vue {
  @Prop({ required: true })
  visible!: boolean;

  @Prop({ required: true })
  identifier!: number;
  @Prop({ required: true })
  positiveAction!: string;

  @Emit()
  public cancel() {}

  @Emit()
  public confirm() {}
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
</style>
