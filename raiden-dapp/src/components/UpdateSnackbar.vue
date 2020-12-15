<template>
  <span v-if="visible">
    <v-snackbar v-model="visible" class="update-snackbar" :timeout="-1" color="primary">
      {{ $t('update.available') }}
      <v-btn dark text :loading="isUpdating" @click="update">
        {{ $t('update.update') }}
      </v-btn>
    </v-snackbar>
  </span>
</template>

<script lang="ts">
/* istanbul ignore file */
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import BlurredOverlay from '@/components/overlays/BlurredOverlay.vue';

@Component({
  components: { BlurredOverlay },
  computed: {
    ...mapGetters(['isConnected', 'versionUpdateAvailable']),
  },
})
export default class UpdateSnackbar extends Vue {
  isConnected!: boolean;
  versionUpdateAvailable!: boolean;
  isUpdating = false;

  get visible(): boolean {
    return this.versionUpdateAvailable;
  }

  async update(): Promise<void> {
    this.isUpdating = true;

    if (this.isConnected) {
      await this.$raiden.disconnect();
    }

    // TODO: trigger actual update.
  }
}
</script>
