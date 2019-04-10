<template>
  <v-app dark>
    <loading v-if="loading"></loading>
    <div id="wallet-wrapper" v-else>
      <div id="wallet">
        <wallet-header></wallet-header>
        <v-content>
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

  constructor() {
    super();
    this.name = 'Raiden Wallet';
  }

  async mounted() {
    await this.$raiden.connect();
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
  display: flex;
  align-items: center;
  justify-content: center;
  @include respond-to(handheld) {
    margin-top: 0;
  }
}

#wallet {
  height: 884px;
  width: 620px;
  border-radius: 14px;
  background-color: #1e1e1e;
  @include respond-to(handheld) {
    width: 320px;
    border-radius: 0;
  }
}

.application {
  background: linear-gradient(90deg, #313030 0%, #000000 100%);
}
</style>
