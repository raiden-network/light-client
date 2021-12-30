<template>
  <span v-if="visible">
    <blurred-overlay :show="blocking" :fullscreen="true" />
    <v-snackbar v-model="showMessage" class="version-snackbar" :timeout="-1" color="primary">
      <v-container class="d-flex align-center py-0">
        <div class="version-snackbar__message">{{ message }}</div>
        <v-btn class="ml-5" dark text :loading="showProgressSpinner" @click="update">
          {{ $t('update.update') }}
        </v-btn>
      </v-container>
    </v-snackbar>
  </span>
</template>

<script lang="ts">
/* istanbul ignore file */
import { Component, Vue, Watch } from 'vue-property-decorator';
import { createNamespacedHelpers, mapState } from 'vuex';

import BlurredOverlay from '@/components/overlays/BlurredOverlay.vue';

const { mapState: mapVersionInformationState, mapGetters: mapVersionInformationGetters } =
  createNamespacedHelpers('versionInformation');

@Component({
  components: { BlurredOverlay },
  computed: {
    ...mapState(['isConnected']),
    ...mapVersionInformationState(['updateIsMandatory', 'updateInProgress']),
    ...mapVersionInformationGetters(['correctVersionIsLoaded', 'updateIsAvailable']),
  },
})
export default class VersionSnackbar extends Vue {
  isConnected!: boolean;
  correctVersionIsLoaded!: boolean;
  updateIsMandatory!: boolean;
  updateIsAvailable!: boolean;
  updateInProgress!: boolean;
  showProgressSpinner = false; // This kicks-in earlier than `updateInProgress` including the shutdown.

  get visible(): boolean {
    return (
      !this.correctVersionIsLoaded ||
      this.updateIsAvailable ||
      this.updateIsMandatory ||
      this.updateInProgress
    );
  }

  get blocking(): boolean {
    return !this.correctVersionIsLoaded || this.updateIsMandatory || this.updateInProgress;
  }

  get message(): string {
    if (this.updateInProgress) {
      return this.$t('update.updateInProgress') as string;
    } else if (this.updateIsMandatory) {
      return this.$t('update.updateMandatory') as string;
    } else if (this.updateIsAvailable) {
      return this.$t('update.updateAvailable') as string;
    } else {
      return '';
    }
  }

  get showMessage(): boolean {
    return this.message.length > 0;
  }

  async update(): Promise<void> {
    this.showProgressSpinner = true;

    if (this.isConnected) {
      await this.$raiden.disconnect();
    }

    this.$serviceWorkerAssistant.update();
  }

  @Watch('updateInProgress', { immediate: true })
  onUpdateInProgressChange(): void {
    this.showProgressSpinner = this.updateInProgress;
  }
}
</script>

<style lang="scss" scoped>
.version-snackbar {
  &__message {
    text-align: justify;
  }
}
</style>
