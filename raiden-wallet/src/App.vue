<template>
  <v-app dark>
    <loading v-if="loading || !initialized"></loading>
    <div id="wallet-wrapper" v-else>
      <div id="wallet">
        <wallet-header></wallet-header>
        <v-content class="wallet-content">
          <router-view></router-view>
        </v-content>
      </div>
    </div>
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Loading from '@/components/Loading.vue';
import WalletHeader from '@/components/WalletHeader.vue';
import { mapState } from 'vuex';

@Component({
  computed: mapState(['loading']),
  components: { WalletHeader, Loading }
})
export default class App extends Vue {
  name: string;
  initialized: boolean = false;

  constructor() {
    super();
    this.name = 'Raiden Wallet';
  }

  async created() {
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
#wallet-wrapper {
  margin-top: 70px;
  margin-bottom: 70px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  @include respond-to(handhelds) {
    margin-top: 0;
  }
}

#wallet {
  min-height: 884px;
  width: 620px;
  border-radius: 14px;
  background-color: #1e1e1e;
  @include respond-to(handhelds) {
    height: 100vh;
    width: 100%;
    border-radius: 0;
  }
}

.wallet-content {
  height: 100%;
}

.application {
  background: $background-gradient;
}
</style>
