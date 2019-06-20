<template>
  <v-app dark>
    <splash-screen v-if="inaccessible" @connect="connect()"></splash-screen>
    <div v-else id="application-wrapper">
      <div id="application-content">
        <app-header></app-header>
        <v-content>
          <v-container fluid fill-height>
            <router-view></router-view>
          </v-container>
        </v-content>
      </div>
    </div>
    <div class="policy">
      <a href="https://raiden.network/privacy.html" target="_blank">
        Privacy Policy, Disclaimer & Imprint
      </a>
    </div>
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import SplashScreen from '@/components/SplashScreen.vue';
import AppHeader from '@/components/AppHeader.vue';
import { mapState } from 'vuex';
import { DeniedReason } from '@/model/types';

@Component({
  computed: mapState(['loading', 'accessDenied']),
  components: { AppHeader, SplashScreen }
})
export default class App extends Vue {
  name: string;
  initialized: boolean = false;
  accessDenied!: DeniedReason;
  loading!: boolean;

  constructor() {
    super();
    this.name = 'Raiden dApp';
  }

  get inaccessible() {
    return (
      !this.initialized ||
      this.loading ||
      this.accessDenied !== DeniedReason.UNDEFINED
    );
  }

  async connect() {
    this.initialized = false;
    this.$store.commit('accessDenied', DeniedReason.UNDEFINED);
    await this.$raiden.connect();
    await this.$raiden.fetchTokens();
    this.initialized = true;
  }

  destroyed() {
    this.$raiden.disconnect();
  }
}
</script>

<style lang="scss" scoped>
@import 'main';
#application-wrapper {
  height: 100%;
  margin-top: 70px;
  margin-bottom: 70px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  @include respond-to(handhelds) {
    margin-top: 0;
  }
}

#application-content {
  height: 100%;
  width: 620px;
  border-radius: 14px;
  background-color: #1e1e1e;
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
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.application {
  background: $background-gradient;
}

.policy {
  font-size: 12px;
  position: absolute;
  right: 0;
  bottom: 0;
  padding: 8px;
  a {
    color: white;
  }
}
</style>
