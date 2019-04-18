<template>
  <v-container>
    <select-token v-if="!token"></select-token>
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

@Component({
  components: { SelectToken, Deposit }
})
export default class Connect extends Vue {
  token: string = '';
  partner: string = '';
  tokenInfo: Token | null = TokenPlaceholder;

  async created() {
    const route = this.$router.currentRoute;
    const params = route.params;
    // if (!params.partner) {
    //   this.$router.push({
    //     name: 'connect',
    //     params: {
    //       token: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    //       partner: '0x1D36124C90f53d491b6832F1c073F43E2550E35b'
    //     }
    //   });
    // }
  }

  async mounted() {
    const route = this.$router.currentRoute;
    const params = route.params;
    this.token = params.token;
    this.partner = params.partner;

    // this.tokenInfo = await this.$raiden.getToken(this.token);
  }
}
</script>

<style lang="scss" scoped>
.container {
  height: calc(100% - 120px);
}
</style>
