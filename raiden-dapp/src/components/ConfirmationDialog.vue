<template>
  <raiden-dialog
    class="confirmation"
    :visible="visible"
    :fullscreen="false"
    @close="cancel"
  >
    <v-card-title>
      <v-row align="center" justify="center">
        <v-col>
          <span>
            <slot name="header"></slot>
          </span>
        </v-col>
      </v-row>
    </v-card-title>

    <v-card-text>
      <v-row align="center" justify="center">
        <span>
          <slot></slot>
        </span>
      </v-row>
    </v-card-text>

    <v-card-actions>
      <v-row align="center" justify="center">
        <v-col>
          <action-button
            :id="`confirm-${identifier}`"
            :enabled="true"
            :text="positiveAction"
            @click="confirm()"
          >
          </action-button>
        </v-col>
      </v-row>
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/RaidenDialog.vue';
@Component({
  components: {
    RaidenDialog,
    ActionButton
  }
})
export default class ConfirmationDialog extends Vue {
  @Prop({ required: true })
  visible!: boolean;
  @Prop({ required: true })
  positiveAction!: string;
  @Prop({ required: true })
  identifier!: number;

  @Emit()
  cancel() {}
  @Emit()
  public confirm() {}
}
</script>

<style scoped lang="scss"></style>
