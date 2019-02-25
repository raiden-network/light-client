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
import { ProviderState } from '@/services/web3-service';
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
    const status = await this.$web3.detectProvider();
    switch (status) {
      case ProviderState.DENIED_ACCESS:
        this.$store.commit('deniedAccess');
        break;
      case ProviderState.NO_PROVIDER:
        this.$store.commit('noProvider');
        break;
      case ProviderState.INITIALIZED:
        this.$store.commit('account', await this.$web3.getAccount());
        this.$store.commit('balance', await this.$web3.getBalance());
        break;
    }

    this.$store.commit('loadComplete');
  }
}
</script>
