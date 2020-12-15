<template>
  <span v-if="visible">
    <blurred-overlay :show="blocking" :fullscreen="true" />
    <v-snackbar v-model="visible" class="update-snackbar" :timeout="-1" color="primary">
      <v-container class="d-flex align-center py-0">
        <div class="update-snackbar__message">{{ message }}</div>
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
import { mapState, mapGetters } from 'vuex';
import BlurredOverlay from '@/components/overlays/BlurredOverlay.vue';
import { VersionInfo } from '@/types';

@Component({
  components: { BlurredOverlay },
  computed: {
    ...mapState(['versionInfo']),
    ...mapGetters(['isConnected', 'versionUpdateAvailable']),
  },
})
export default class UpdateSnackbar extends Vue {
  versionInfo!: VersionInfo;
  isConnected!: boolean;
  versionUpdateAvailable!: boolean;
  isUpdating = false;

  get visible(): boolean {
    return this.versionUpdateAvailable || this.versionInfo.updateIsMandatory;
  }

  get blocking(): boolean {
    return this.versionInfo.updateIsMandatory;
  }

  get message(): string {
    if (this.visible) {
      const subKey = this.versionInfo.updateIsMandatory ? 'mandatory' : 'optional';
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
.update-snackbar {
  &__message {
    text-align: justify;
  }
}
</style>
