<template>
  <v-app>
    <wallet-header></wallet-header>
    <v-content>
      <loading v-if="loading"></loading>
      <router-view v-else></router-view>
    </v-content>
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Loading from '@/components/Loading.vue';
import WalletHeader from '@/components/WalletHeader.vue';

@Component({
  components: { WalletHeader, Loading }
})
export default class App extends Vue {
  name: string;

  constructor() {
    super();
    this.name = 'Raiden Wallet';
  }

  get loading(): boolean {
    return this.$store.state.loading;
  }

  async mounted() {
    await this.$raiden.connect();
  }

  destroyed() {
    this.$raiden.disconnect();
  }
}
</script>
