<template>
  <span v-if="updateAvailable">
    <blurred-overlay :show="updateAvailable" />
    <v-snackbar v-model="updateAvailable" :timeout="0" color="primary">
      {{ $t('update.available') }}
      <v-btn dark text :loading="isUpdating" @click="update">
        {{ $t('update.update') }}
      </v-btn>
    </v-snackbar>
  </span>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import BlurredOverlay from '@/components/BlurredOverlay.vue';

@Component({ components: { BlurredOverlay } })
export default class UpdateSnackbar extends Vue {
  isUpdating: boolean = false;
  updateAvailable: boolean = false;
  swRegistration: ServiceWorkerRegistration | null = null;

  created() {
    document.addEventListener('swUpdated', this.handleSWUpdate, { once: true });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      setTimeout(() => {
        this.updateAvailable = false;
        window.location.reload();
      }, 1500);
    });
  }
  beforeDestroy() {
    document.removeEventListener('swUpdated', this.handleSWUpdate);
  }

  handleSWUpdate(event: any) {
    this.swRegistration = event.detail;
    this.updateAvailable = true;
  }

  update() {
    this.isUpdating = true;
    if (!this.swRegistration || !this.swRegistration.waiting) {
      return;
    }
    this.swRegistration.waiting.postMessage('skipWaiting');
  }
}
</script>
