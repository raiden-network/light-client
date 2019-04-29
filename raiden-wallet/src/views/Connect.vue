<template>
  <v-container>
    <select-token v-if="!token"></select-token>
    <select-hub :token="tokenInfo" v-else-if="!partner"></select-hub>
    <deposit
      v-else
      :token="token"
      :partner="partner"
      :tokenInfo="tokenInfo"
    ></deposit>
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Deposit from '@/components/Deposit.vue';
import { Token, TokenPlaceholder } from '@/model/types';
import SelectToken from '@/components/SelectToken.vue';
import SelectHub from '@/components/SelectHub.vue';

@Component({
  components: { SelectHub, SelectToken, Deposit }
})
export default class Connect extends Vue {
  token: string = '';
  partner: string = '';
  tokenInfo: Token | null = TokenPlaceholder;

  async created() {
    const route = this.$router.currentRoute;
    const params = route.params;
    this.token = params.token;
    this.partner = params.partner;

    if (this.token) {
      this.tokenInfo = await this.$raiden.getToken(this.token);
    }
  }
}
</script>

<style lang="scss" scoped></style>
