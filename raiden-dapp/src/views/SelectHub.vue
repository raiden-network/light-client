<template>
  <v-form v-model="valid" autocomplete="off" class="select-hub">
    <v-layout column justify-space-between fill-height>
      <v-layout align-center justify-center>
        <v-flex xs10>
          <address-input v-model="partner"></address-input>
        </v-flex>
      </v-layout>

      <divider></divider>
      <token-information :token="token"></token-information>

      <action-button
        :enabled="valid"
        @click="selectHub()"
        :text="$t('select-hub.select-button')"
      ></action-button>
    </v-layout>
  </v-form>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { Token, TokenPlaceholder } from '@/model/types';
import AddressInput from '@/components/AddressInput.vue';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import Divider from '@/components/Divider.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';

@Component({
  components: { TokenInformation, Divider, AddressInput, ActionButton }
})
export default class SelectHub extends Mixins(NavigationMixin) {
  token: Token = TokenPlaceholder;

  partner: string = '';
  valid: boolean = false;

  selectHub() {
    this.navigateToOpenChannel(this.token.address, this.partner);
  }

  async created() {
    const { token } = this.$route.params;
    if (!AddressUtils.checkAddressChecksum(token)) {
      this.navigateToHome();
      return;
    }

    let tokenInfo = this.$store.getters.token(token);
    if (!tokenInfo) {
      tokenInfo = await this.$raiden.getToken(token);
    }

    if (!tokenInfo) {
      this.navigateToHome();
    } else {
      this.token = tokenInfo;
    }
  }
}
</script>

<style lang="scss" scoped>
.select-hub {
  height: 100%;
  width: 100%;
}
</style>
