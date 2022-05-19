<template>
  <raiden-dialog class="download-state" :visible="visible" @close="cancel">
    <v-card-title>
      {{ $t('backup-state.download') }}
    </v-card-title>

    <v-card-text>
      <v-img class="download-state__warning my-4" :src="require('@/assets/warning.svg')" />
      <span>{{ $t('backup-state.download-warning') }}</span>
    </v-card-text>

    <v-card-actions>
      <action-button
        data-cy="download_state_button"
        class="download-state__button"
        full-width
        :enabled="!!href"
        :href="href"
        :download="filename"
        :text="$t('backup-state.download-button')"
        @click="cancel"
      />
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Mixins, Prop, Watch } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
  components: {
    RaidenDialog,
    ActionButton,
  },
})
export default class DownloadStateDialog extends Mixins(NavigationMixin) {
  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;

  href = '';
  filename = '';

  @Emit()
  cancel(): boolean {
    return true;
  }

  @Watch('visible', { immediate: true })
  async onVisibilityChanged(visible: boolean) {
    if (!visible) {
      this.href = '';
      this.filename = '';
    } else {
      this.filename = `raiden_lc_state_${new Date().toISOString()}.json`;
      this.href = await this.getStateFileURL(this.filename);
    }
  }

  /* istanbul ignore next */
  async getStateFileURL(filename: string): Promise<string> {
    let stateJSON = '[';
    let count = 0;
    for await (const row of this.$raiden.getDatabaseDump()) {
      stateJSON += (count++ ? ',\n' : '\n') + JSON.stringify(row);
    }
    stateJSON += '\n]';
    const file = new File([stateJSON], filename, { type: 'application/json' });
    return URL.createObjectURL(file);
  }
}
</script>

<style scoped lang="scss">
.download-state {
  &__warning {
    height: 105px;
    width: 120px;
    margin: 0 auto;
  }
}
</style>
