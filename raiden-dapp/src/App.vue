<template>
  <v-app dark>
    <splash-screen
      v-if="inaccessible"
      :connecting="connecting"
      :connecting-subkey="connectingSubkey"
      @connect="connect"
    ></splash-screen>
    <div v-else id="application-wrapper">
      <router-view name="modal" />
      <div id="application-content">
        <app-header></app-header>
        <v-content>
          <v-container fluid class="application__container fill-height">
            <router-view></router-view>
          </v-container>
        </v-content>
      </div>
    </div>
    <ul v-if="version" class="raiden-versions">
      <li>{{ $t('versions.sdk', { version }) }}</li>
      <li>{{ $t('versions.contracts', { version: contractVersion }) }}</li>
    </ul>
    <div class="policy">
      <a href="https://raiden.network/privacy.html" target="_blank">
        {{ $t('application.privacy-policy') }}
      </a>
    </div>
    <offline-snackbar />
    <update-snackbar />
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { Raiden } from 'raiden-ts';

import SplashScreen from '@/components/SplashScreen.vue';
import AppHeader from '@/components/AppHeader.vue';
import OfflineSnackbar from '@/components/OfflineSnackbar.vue';
import UpdateSnackbar from '@/components/UpdateSnackbar.vue';
import { DeniedReason } from '@/model/types';

@Component({
  computed: mapState(['loading', 'accessDenied']),
  components: { AppHeader, SplashScreen, OfflineSnackbar, UpdateSnackbar }
})
export default class App extends Vue {
  name: string;
  connecting: boolean = false;
  connectingSubkey: boolean = false;
  accessDenied!: DeniedReason;
  loading!: boolean;

  constructor() {
    super();
    this.name = 'Raiden dApp';
  }

  get inaccessible() {
    return (
      this.connecting ||
      this.loading ||
      this.accessDenied !== DeniedReason.UNDEFINED
    );
  }

  get version() {
    return Raiden.version;
  }

  get contractVersion() {
    return Raiden.contractVersion;
  }

  async connect(subkey?: true) {
    if (subkey) {
      this.connectingSubkey = true;
    } else {
      this.connecting = true;
    }

    this.$store.commit('reset');
    await this.$raiden.connect(subkey);
    this.connectingSubkey = false;
    this.connecting = false;
  }

  destroyed() {
    this.$raiden.disconnect();
  }
}
</script>

<style lang="scss" scoped>
@import 'scss/mixins';
@import 'scss/colors';

#application-wrapper {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

#application-content {
  height: 844px;
  width: 620px;
  border-radius: 10px;
  background-color: $card-background;
  @include respond-to(handhelds) {
    height: 100vh;
    width: 100%;
    border-radius: 0;
  }
}

.v-content {
  height: calc(100% - 120px);
  margin-bottom: auto;
}

.container {
  overflow-x: hidden;
  padding: 0 !important;
}

.application {
  &__container {
    height: calc(100% - 8px);
  }
}

.v-application {
  background: $background-gradient !important;

  @include respond-to(handhelds) {
    background: $card-background !important;
  }
}

.raiden-versions {
  font-size: 13px;
  margin: 27px auto 6px auto;
  color: $secondary-button-color;
  list-style: none;
  padding: 0;

  li {
    display: inline-block;

    &:not(:last-child) {
      margin-right: 15px;
    }
  }
}

.policy {
  font-size: 13px;
  margin: 0 auto 27px auto;

  a {
    color: $secondary-text-color;
    text-decoration: none;
  }
}
</style>
