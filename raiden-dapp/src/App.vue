<template>
  <v-app dark>
    <install-banner />
    <div id="application-wrapper">
      <router-view name="modal" />
      <transition name="slide">
        <router-view name="notifications" />
      </transition>
      <div id="application-content">
        <app-header />
        <v-main>
          <v-container fluid class="application__container fill-height">
            <router-view />
          </v-container>
        </v-main>
      </div>
    </div>
    <div v-if="imprint && terms" class="imprint">
      <a :href="imprint" target="_blank" class="imprint__policy">
        {{ $t('application.privacy-policy') }}
      </a>
      <a :href="terms" target="_blank" class="imprint__terms">
        {{ $t('application.terms') }}
      </a>
    </div>
    <offline-snackbar />
    <update-snackbar />
    <receiving-ongoing-snackbar />
    <notification-snackbar />
  </v-app>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';

import AppHeader from '@/components/AppHeader.vue';
import InstallBanner from '@/components/InstallBanner.vue';
import NotificationSnackbar from '@/components/notification-panel/NotificationSnackbar.vue';
import OfflineSnackbar from '@/components/OfflineSnackbar.vue';
import ReceivingOngoingSnackbar from '@/components/ReceivingOngoingSnackbar.vue';
import UpdateSnackbar from '@/components/UpdateSnackbar.vue';

import NavigationMixin from './mixins/navigation-mixin';

@Component({
  components: {
    AppHeader,
    OfflineSnackbar,
    UpdateSnackbar,
    NotificationSnackbar,
    ReceivingOngoingSnackbar,
    InstallBanner,
  },
})
export default class App extends Mixins(NavigationMixin) {
  get imprint(): string | undefined {
    return process.env.VUE_APP_IMPRINT;
  }
  get terms(): string | undefined {
    return process.env.VUE_APP_TERMS;
  }

  destroyed() {
    this.$raiden.disconnect();
  }
}
</script>

<style lang="scss" scoped>
@import 'scss/mixins';
@import 'scss/colors';

.slide-enter-active {
  animation: slide-in 0.5s;
}
.slide-leave-active {
  animation: slide-in 0.5s reverse;
}
@keyframes slide-in {
  0% {
    opacity: 0;
    transform: translate3d(100%, 0, 0);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.v-application {
  background: $background-gradient !important;
  @include respond-to(handhelds) {
    background: $card-background !important;
  }
}

#application-wrapper {
  align-items: center;
  display: flex;
  height: 100%;
  justify-content: center;
}

#application-content {
  background-color: $card-background;
  border-radius: 10px;
  height: 844px;
  margin-top: 25px;
  width: 620px;
  @include respond-to(handhelds) {
    border-radius: 0;
    height: 100vh;
    margin-top: 0;
    width: 100%;
  }
}

.v-main {
  height: calc(100% - 80px);
  margin-bottom: auto;
}

.container {
  height: calc(100% - 8px);
  overflow-x: hidden;
  overflow-y: hidden;
  padding: 0 !important;
}

.imprint {
  font-size: 13px;
  margin: 15px auto 15px auto;

  a {
    color: $secondary-text-color;
    text-decoration: none;
  }
}
</style>
