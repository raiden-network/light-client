<template>
  <div class="content-host">
    <v-form autocomplete="off" v-model="valid">
      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10>
          <div class="screen-title">Select Hub</div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10>
          <address-input
            class="address-input"
            v-model="partner"
          ></address-input>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <div class="divider"></div>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10 class="information">
          <div class="information-label text-xs-left">Token</div>
          <div class="information-description text-xs-left">
            <span class="font-weight-medium">{{ token.symbol }}</span>
            · {{ token.name }}
          </div>
          <div class="text--secondary">
            {{ token.address }}
          </div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center class="section">
        <v-flex xs10 md10 lg10 class="text-xs-center">
          <v-btn
            class="text-capitalize confirm-button"
            depressed
            id="select-hub"
            :disabled="!valid"
            large
            @click="selectHub()"
          >
            Select Hub
          </v-btn>
        </v-flex>
      </v-layout>
    </v-form>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { Token, TokenPlaceholder } from '@/model/types';
import AddressInput from '@/components/AddressInput.vue';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
  components: { AddressInput }
})
export default class SelectHub extends Mixins(NavigationMixin) {
  token: Token = TokenPlaceholder;

  partner: string = '';
  valid: boolean = false;

  selectHub() {
    this.navigateToDeposit(this.token.address, this.partner);
  }

  async created() {
    const params = this.$route.params;
    const tokenAddress = params.token;
    if (!AddressUtils.checkAddressChecksum(tokenAddress)) {
      this.navigateToHome();
      return;
    }

    let token = this.$store.getters.token(tokenAddress);
    if (!token) {
      token = await this.$raiden.getToken(tokenAddress);
    }

    if (!token) {
      this.navigateToHome();
    } else {
      this.token = token;
    }
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/input-screen';
</style>
