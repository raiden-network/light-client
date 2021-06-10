<template>
  <raiden-dialog
    data-cy="open_channel_dialog"
    class="open-channel-dialog"
    :visible="visible"
    hide-close
    @close="cancel"
  >
    <v-card-title>
      {{ title }}
    </v-card-title>

    <v-card-text>
      <template v-if="done">
        <v-img class="open-channel-dialog__done my-4" :src="require('@/assets/done.svg')" />
        <span>{{ doneStep.description }}</span>
      </template>

      <template v-else>
        <spinner />
        <span v-if="steps.length > current">
          {{ steps[current].description }}
        </span>
      </template>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';

import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';
import type { StepDescription } from '@/model/types';

@Component({
  components: { RaidenDialog, Spinner },
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

  get title(): string {
    if (this.done) {
      return this.doneStep.title;
    } else if (this.steps.length > this.current) {
      return this.steps[this.current].title;
    } else {
      return '';
    }
  }

  @Emit()
  cancel(): boolean {
    return true;
  }
}
</script>

<style lang="scss">
.open-channel-dialog {
  &__done {
    height: 110px;
    width: 110px;
    margin: 0 auto;
  }
}
</style>
