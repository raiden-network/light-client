<template>
  <deposit :token="token" :partner="partner" :tokenInfo="tokenInfo"></deposit>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Route } from 'vue-router';
import AddressUtils from '@/utils/address-utils';
import Deposit from '@/components/Deposit.vue';
import { Token } from '@/model/token';

@Component({
  components: { Deposit }
})
export default class Connect extends Vue {
  token: string = '0xd0A1E359811322d97991E03f863a0C30C2cF029C';
  partner: string = '0x1D36124C90f53d491b6832F1c073F43E2550E35b';
  tokenInfo: Token | null = null;

  private async loadTokenInfo(next: string) {
    if (next && !AddressUtils.isAddress(next)) {
      return null;
    }

    return this.$raiden.getToken(next);
  }

  async mounted() {
    this.tokenInfo = await this.loadTokenInfo(this.token);
    let route = this.$router.currentRoute;
    let params = route.params;
    if (!params.token || !params.partner) {
      this.$router.push({
        name: 'connect',
        params: { token: this.token, partner: this.partner }
      });
    }
  }
}
</script>

<style lang="scss" scoped></style>
