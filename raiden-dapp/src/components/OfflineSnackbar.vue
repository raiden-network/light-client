<template>
  <span v-if="offline">
    <blurred-overlay :show="offline" :fullscreen="true" />
    <v-snackbar v-model="offline" :timeout="0" color="error">
      {{ $t('general.offline') }}
      <v-icon>mdi-alert</v-icon>
    </v-snackbar>
  </span>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import BlurredOverlay from '@/components/BlurredOverlay.vue';

@Component({ components: { BlurredOverlay } })
export default class OfflineSnackbar extends Vue {
  offline: boolean = false;

  handleOnline() {
    this.offline = false;
  }

  handleOffline() {
    this.offline = true;
  }

  mounted() {
    this.offline = !navigator.onLine;

    window.addEventListener('offline', this.handleOffline);
    window.addEventListener('online', this.handleOnline);
  }

  beforeDestroy() {
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('online', this.handleOnline);
  }
}
</script>
