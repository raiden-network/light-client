<template>
  <raiden-dialog
    class="open-channel-dialog"
    :visible="visible"
    hide-close
    @close="cancel"
  >
    <v-card-title>
      <v-row align="center" justify="center">
        <v-col>
          <span v-if="done">
            {{ doneStep.title }}
          </span>
          <span v-else-if="steps.length > current">
            {{ steps[current].title }}
          </span>
        </v-col>
      </v-row>
    </v-card-title>

    <v-card-actions>
      <v-row v-if="done" align="center" justify="center">
        <v-col cols="6">
          <v-img
            class="open-channel-dialog__done"
            :src="require('../assets/done.svg')"
          ></v-img>
        </v-col>
      </v-row>

      <v-row v-else align="center" justify="center">
        <v-col cols="6">
          <v-progress-circular
            class="open-channel-dialog__progress"
            :size="110"
            :width="7"
            indeterminate
          >
          </v-progress-circular>
        </v-col>
      </v-row>
    </v-card-actions>

    <v-card-text>
      <v-row align="center" justify="center">
        <span v-if="done">
          {{ doneStep.description }}
        </span>
        <span v-else-if="steps.length > current">
          {{ steps[current].description }}
        </span>
      </v-row>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import RaidenDialog from '@/components/RaidenDialog.vue';
import { StepDescription } from '@/model/types';
@Component({
  components: {
    RaidenDialog
  }
})
export default class OpenChannelDialog extends Vue {
  @Prop({ required: true })
  visible!: boolean;
  @Prop({ required: true })
  steps!: StepDescription[];
  @Prop({ required: false, default: 0 })
  current!: number;
  @Prop({ required: false })
  done?: boolean;
  @Prop({ required: true })
  doneStep!: StepDescription;

  @Emit()
  cancel() {}
}
</script>

<style scoped lang="scss">
@import '../scss/colors';

.open-channel-dialog {
  &__progress {
    color: $secondary-color;
  }
}
</style>
