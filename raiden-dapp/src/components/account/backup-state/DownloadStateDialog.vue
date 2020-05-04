<template>
  <raiden-dialog class="download-state" :visible="visible" @close="cancel">
    <v-card-title>
      {{ $t('backup-state.download') }}
    </v-card-title>

    <v-card-text>
      <v-row align="center" justify="center" no-gutters>
        <v-col cols="6">
          <v-img
            class="download-state__warning"
            :src="require('@/assets/warning.svg')"
          ></v-img>
        </v-col>
        <v-col cols="12">
          {{ $t('backup-state.download-warning') }}
        </v-col>
      </v-row>
    </v-card-text>

    <v-card-actions>
      <action-button
        enabled
        full-width
        :text="$t('backup-state.download-button')"
        @click="getAndDownloadState()"
      ></action-button>
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Prop, Emit, Mixins } from 'vue-property-decorator';
import RaidenDialog from '@/components/RaidenDialog.vue';
import ActionButton from '@/components/ActionButton.vue';
import NavigationMixin from '../../../mixins/navigation-mixin';

@Component({
  components: {
    RaidenDialog,
    ActionButton
  }
})
export default class DownloadStateDialog extends Mixins(NavigationMixin) {
  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;

  @Emit()
  cancel() {}

  /* istanbul ignore next */
  async getAndDownloadState() {
    this.navigateToHome();
    const state = await this.$raiden.getState();
    const stateJSON = JSON.stringify(state);
    const filename = `raiden_lc_state_${new Date().toISOString()}.json`;
    const file = new File([stateJSON], filename, { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const el = document.createElement('a');

    el.href = url;
    el.download = filename;
    el.style.display = 'none';
    document.body.appendChild(el);
    el.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(el);
    }, 0);
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
