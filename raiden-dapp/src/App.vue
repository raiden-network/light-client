<template>
  <v-app dark>
    <splash-screen
      v-if="inaccessible"
      @connect="connect()"
      :connecting="connecting"
    ></splash-screen>
    <div id="application-wrapper" v-else>
      <div id="application-content">
        <app-header></app-header>
        <v-content>
          <v-container fluid fill-height class="application__container">
            <router-view></router-view>
          </v-container>
        </v-content>
      </div>
    </div>
    <div class="policy">
      <a href="https://raiden.network/privacy.html" target="_blank">
        {{ $t('application.privacy-policy') }}
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
  connecting: boolean = false;
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

  async connect() {
    this.connecting = true;
    this.$store.commit('reset');
    await this.$raiden.connect();
    this.connecting = false;
  }

  destroyed() {
    this.$raiden.disconnect();
  }
}
</script>

<style lang="scss" scoped>
@import 'main';
@import 'scss/colors';
#application-wrapper {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  @include respond-to(handhelds) {
    margin-top: 0;
  }
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

.application__container {
  height: calc(100% - 8px);
}

.v-application {
  background: $background-gradient !important;
}

.policy {
  font-size: 13px;
  line-height: 15px;
  bottom: 0;
  left: 0;
  right: 0;
  width: 220px;
  margin-left: auto;
  margin-right: auto;
  padding: 0 0 27px;

  a {
    color: #646464;
  }
}
</style>
