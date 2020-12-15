<template>
  <v-banner v-if="visible" color="#1e1e1e" two-line>
    <template v-if="$vuetify.breakpoint.mobile">
      {{ $t('install-banner.message-mobile') }}
    </template>

    <template v-else>
      {{ $t('install-banner.message-desktop') }}
    </template>

    <template #actions="{ dismiss }">
      <v-btn dark text outlined @click="install">
        {{ $t('install-banner.install') }}
      </v-btn>

      <v-btn dark text outlined @click="dismiss">
        {{ $t('install-banner.dismiss') }}
      </v-btn>
    </template>
  </v-banner>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component
export default class InstallBanner extends Vue {
  visible = false;
  installEvent: BeforeInstallPromptEvent | undefined = undefined;

  created(): void {
    window.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
  }

  onBeforeInstallPrompt(event: BeforeInstallPromptEvent): void {
    event.preventDefault();
    this.installEvent = event;
    this.visible = true;
  }

  async install(): Promise<void> {
    if (!this.installEvent) return;

    this.visible = false;
    await this.installEvent.prompt();
    this.installEvent = undefined;
  }
}
</script>
