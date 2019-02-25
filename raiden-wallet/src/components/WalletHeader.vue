<template>
  <v-layout
    class="header"
    justify-center
    align-center
    v-if="!loading && account"
  >
    <v-flex md1 xs1>
      <v-img
        class="logo"
        contain="true"
        aspect-ratio="1"
        :src="require('../assets/logo.svg')"
      ></v-img>
    </v-flex>
    <v-flex md3 xs3 offset-md1 offset-xs1>
      <div class="headline">Raiden Wallet</div>
      <div class="font-weight-light">{{ account | truncate }}</div>
    </v-flex>
    <v-flex md2 xs2>
      <div class="subheading">Balance</div>
      <div>
        <span class="font-weight-light">{{ balance | decimals }}</span>
        <sup>ETHER</sup>
      </div>
    </v-flex>
    <v-flex md1 xs1>
      <v-img
        contain="true"
        aspect-ratio="1"
        class="blockie"
        :src="blockie"
      ></v-img>
    </v-flex>
  </v-layout>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import OpenChannel from '@/components/OpenChannel.vue';
import { RootState } from '@/types';

@Component({
  components: { OpenChannel }
})
export default class WalletHeader extends Vue {
  get loading(): boolean {
    return this.$store.state.loading;
  }

  get account(): string {
    return this.$store.state.defaultAccount;
  }

  get blockie(): string {
    return this.$identicon.getIdenticon(this.account);
  }

  get balance(): string {
    return (this.$store.state as RootState).accountBalance;
  }
}
</script>

<style scoped lang="scss">
.blockie {
  border-radius: 50%;
}

.logo {
  filter: invert(100%);
}
.header {
  color: #fff;
  max-height: 120px;
  background: black;
  padding-top: 20px;
  padding-bottom: 20px;
}
</style>
