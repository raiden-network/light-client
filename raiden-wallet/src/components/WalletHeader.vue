<template>
  <v-layout
    class="header"
    justify-center
    align-center
    v-if="!loading && defaultAccount"
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
          <div class="font-weight-light">{{ defaultAccount | truncate }}</div>
        </div>
        <v-spacer></v-spacer>
        <div>
          <div class="subheading">Balance</div>
          <div id="balance">
            <span class="font-weight-light">{{
              accountBalance | decimals
            }}</span>
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
import { mapState } from 'vuex';

@Component({
  computed: mapState(['loading', 'defaultAccount', 'accountBalance'])
})
export default class WalletHeader extends Vue {
  defaultAccount!: string;
  loading!: boolean;
  accountBalance!: string;

  get blockie(): string {
    return this.$identicon.getIdenticon(this.defaultAccount);
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
