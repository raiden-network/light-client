<template>
  <span v-if="offline">
    <div class="offline-overlay" />
    <v-snackbar v-model="offline" :timeout="0" color="error">
      {{ $t('general.offline') }}
      <v-icon>mdi-alert</v-icon>
    </v-snackbar>
  </span>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
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

<style scoped lang="scss">
@import '../scss/colors';

.offline-overlay {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  backdrop-filter: blur(4px);
  background-color: rgba($color-white, 0.15);
}
</style>
