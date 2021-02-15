<template>
  <raiden-dialog class="download-state" :visible="visible" @close="cancel">
    <v-card-title>
      {{ $t('backup-state.download') }}
    </v-card-title>

    <v-card-text>
      <v-row align="center" justify="center" no-gutters>
        <v-col cols="6">
          <v-img class="download-state__warning" :src="require('@/assets/warning.svg')" />
        </v-col>
        <v-col cols="12">
          {{ $t('backup-state.download-warning') }}
        </v-col>
      </v-row>
    </v-card-text>

    <v-card-actions>
      <action-button
        data-cy="download_state_button"
        class="download-state__button"
        enabled
        full-width
        :text="$t('backup-state.download-button')"
        @click="getAndDownloadState()"
      />
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Mixins, Prop } from 'vue-property-decorator';

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

  @Emit()
  cancel(): boolean {
    return true;
  }

  /* istanbul ignore next */
  async getAndDownloadState() {
    const filename = `raiden_lc_state_${new Date().toISOString()}.json`;
    const stateFileURL = await this.getStateFileURL(filename);
    const downloadLink = this.createDownloadLink(filename, stateFileURL);

    downloadLink.click();
    this.revokeDownloadURL(stateFileURL, downloadLink);
    this.navigateToHome();
  }

  /* istanbul ignore next */
  async getStateFileURL(filename: string): Promise<string> {
    const state = await this.$raiden.getState();
    const stateJSON = JSON.stringify(state);
    const file = new File([stateJSON], filename, { type: 'application/json' });
    return URL.createObjectURL(file);
  }

  /* istanbul ignore next */
  createDownloadLink(filename: string, url: string): HTMLAnchorElement {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    return document.body.appendChild(anchor);
  }

  /* istanbul ignore next */
  revokeDownloadURL(stateFileURL: string, downloadLink: HTMLAnchorElement): void {
    setTimeout(() => {
      URL.revokeObjectURL(stateFileURL);
      document.body.removeChild(downloadLink);
    }, 1);
  }
}
</script>

<style scoped lang="scss">
.download-state {
  &__warning {
    height: 110px;
    margin-bottom: 20px;
  }
}
</style>
