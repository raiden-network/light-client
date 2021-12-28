<template>
  <span v-if="visible">
    <blurred-overlay :show="blocking" :fullscreen="true" />
    <v-snackbar v-model="visible" class="version-snackbar" :timeout="-1" color="primary">
      <v-container class="d-flex align-center py-0">
        <div class="version-snackbar__message">{{ message }}</div>
        <v-btn class="ml-5" dark text :loading="isUpdating" @click="update">
          {{ $t('update.update') }}
        </v-btn>
      </v-container>
    </v-snackbar>
  </span>
</template>

<script lang="ts">
/* istanbul ignore file */
import { Component, Vue } from 'vue-property-decorator';
import { createNamespacedHelpers, mapState } from 'vuex';

import BlurredOverlay from '@/components/overlays/BlurredOverlay.vue';

const { mapState: mapVersionInformationState, mapGetters: mapVersionInformationGetters } =
  createNamespacedHelpers('versionInformation');

@Component({
  components: { BlurredOverlay },
  computed: {
    ...mapState(['isConnected']),
    ...mapVersionInformationState(['updateIsMandatory']),
    ...mapVersionInformationGetters(['updateIsAvailable']),
  },
})
export default class VersionSnackbar extends Vue {
  isConnected!: boolean;
  updateIsMandatory!: boolean;
  updateIsAvailable!: boolean;
  isUpdating = false;

  get visible(): boolean {
    return this.updateIsAvailable || this.updateIsMandatory;
  }

  get blocking(): boolean {
    return this.updateIsMandatory;
  }

  get message(): string {
    if (this.visible) {
      const subKey = this.updateIsMandatory ? 'mandatory' : 'optional';
      return this.$t(`update.${subKey}`) as string;
    } else {
      return '';
    }
  }

  async update(): Promise<void> {
    this.isUpdating = true;

    if (this.isConnected) {
      await this.$raiden.disconnect();
    }

    this.$serviceWorkerAssistant.update();
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
