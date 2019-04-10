<template>
  <div>
    <v-layout
      class="header"
      justify-center
      align-center
      v-if="!loading && defaultAccount"
    >
      <v-flex lg12 md12 xs12>
        <div id="header-content">
          <div class="navigation-button"></div>
          <v-spacer></v-spacer>
          <div class="raiden-wallet">Raiden Wallet</div>
          <v-spacer></v-spacer>
          <div>
            <v-img
              height="36"
              width="36"
              contain
              aspect-ratio="1"
              class="blockie"
              :src="blockie"
            ></v-img>
          </div>
        </div>
      </v-flex>
    </v-layout>
    <v-layout class="row-2" align-center>
      <v-flex lg6 md6 xs6>
        <div class="address text-xs-left">
          {{ defaultAccount | truncate }}
        </div>
      </v-flex>
      <v-flex lg6 md6 xs6>
        <div class="balance text-xs-right">
          {{ accountBalance | decimals }} ETHER
        </div>
      </v-flex>
    </v-layout>
  </div>
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
  box-sizing: border-box;
  height: 36px;
  width: 36px;
  border: 1px solid #979797;
  background-color: #d8d8d8;
}
.navigation-button {
  width: 36px;
  height: 36px;
}

.raiden-wallet {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 24px;
  line-height: 28px;
  text-align: center;
}

.address {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 19px;
}

.balance {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 19px;
}

.header {
  height: 80px;
  width: 620px;
  border-radius: 14px;
  background-color: #141414;
  box-shadow: 5px 5px 15px 0 rgba(0, 0, 0, 0.3);
}

$row-horizontal-padding: 34px;
.row-2 {
  padding-left: $row-horizontal-padding;
  padding-right: $row-horizontal-padding;
  height: 40px;
  background-color: #323232;
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
