<template>
  <v-form v-model="valid" autocomplete="off" class="select-hub">
    <v-row align="center" justify="center" no-gutters>
      <v-col cols="10">
        <address-input
          v-model="partner"
          :value="partner"
          :exclude="[token.address, defaultAccount]"
        ></address-input>
      </v-col>
    </v-row>

    <divider></divider>
    <token-information :token="token"></token-information>

    <action-button
      :enabled="valid"
      :text="$t('select-hub.select-button')"
      @click="selectHub()"
    ></action-button>
  </v-form>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import isEmpty from 'lodash/isEmpty';
import { mapGetters, mapState } from 'vuex';
import { RaidenChannels } from 'raiden-ts';
import { Network } from 'ethers/utils';

import { Token } from '@/model/types';
import AddressInput from '@/components/AddressInput.vue';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import Divider from '@/components/Divider.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';

@Component({
  components: { TokenInformation, Divider, AddressInput, ActionButton },
  computed: {
    ...mapState(['defaultAccount', 'channels', 'network']),
    ...mapGetters({
      getToken: 'token'
    })
  }
})
export default class SelectHub extends Mixins(NavigationMixin) {
  defaultAccount!: string;
  channels!: RaidenChannels;
  network!: Network;
  getToken!: (address: string) => Token;

  partner: string = '';
  valid: boolean = false;

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.getToken(address) || ({ address } as Token);
  }

  selectHub() {
    this.navigateToOpenChannel(this.token.address, this.partner);
  }

  get isConnectedToHub() {
    const { token: address } = this.$route.params;
    return !isEmpty(this.channels[address]);
  }

  async created() {
    const { token: address } = this.$route.params;
    if (!AddressUtils.checkAddressChecksum(address)) {
      this.navigateToHome();
      return;
    }

    await this.$raiden.fetchTokenData([address]);

    if (typeof this.token.decimals !== 'number') {
      this.navigateToHome();
    }

    // On goerli, we can suggest our hub if the user is not connected yet
    if (!this.isConnectedToHub && this.network.name === 'goerli') {
      this.partner = process.env.VUE_APP_HUB ?? '';
    }
  }
}
</script>

<style lang="scss" scoped>
.select-hub {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}
</style>
