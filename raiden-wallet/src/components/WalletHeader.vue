<template>
  <v-layout
    class="header"
    justify-center
    align-center
    v-if="!loading && account"
  >
    <v-flex lg6 md8 xs12>
      <div id="header-content">
        <div>
          <v-img
            class="logo"
            height="70"
            width="70"
            contain
            aspect-ratio="1"
            :src="require('../assets/logo.svg')"
          ></v-img>
        </div>
        <div>
          <div class="headline">Raiden Wallet</div>
          <div class="font-weight-light">{{ account | truncate }}</div>
        </div>
        <v-spacer></v-spacer>
        <div>
          <div class="subheading">Balance</div>
          <div id="balance">
            <span class="font-weight-light">{{ balance | decimals }}</span>
            <sup>ETHER</sup>
          </div>
        </div>
        <div>
          <v-img
            height="70"
            width="70"
            contain
            aspect-ratio="1"
            class="blockie"
            :src="blockie"
          ></v-img>
        </div>
      </div>
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
#balance sup {
  padding-left: 4px;
}

#header-content {
  display: flex;
  align-items: center;
  justify-content: center;
}
@media only screen and (max-width: 600px) {
  $header-content-horizontal-margin: 0.6rem;
  #header-content > * {
    margin-right: $header-content-horizontal-margin;
    margin-left: $header-content-horizontal-margin;
  }
}

@media only screen and (min-width: 601px) {
  $header-content-horizontal-margin: 1.4rem;
  #header-content > * {
    margin-right: $header-content-horizontal-margin;
    margin-left: $header-content-horizontal-margin;
  }
}
</style>
