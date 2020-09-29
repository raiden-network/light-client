<template>
  <v-container class="transfer">
    <no-tokens v-if="noTokens" />
    <template v-else>
      <transfer-headers
        class="transfer__menus"
        :token="token"
        :capacity="capacity"
      />
      <transfer-inputs
        class="transfer__inputs"
        :token="token"
        :capacity="capacity"
      />
      <transaction-list class="transfer__list" :token="token" />
      <no-channels-dialog :visible="!openChannels" />
    </template>
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import TransferHeaders from '@/components/transfer/TransferHeaders.vue';
import TransferInputs from '@/components/transfer/TransferInputs.vue';
import TransactionList from '@/components/transaction-history/TransactionList.vue';
import NoTokens from '@/components/NoTokens.vue';
import NoChannelsDialog from '@/components/dialogs/NoChannelsDialog.vue';
import { RaidenChannel } from 'raiden-ts';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';
import { Token, TokenModel } from '@/model/types';

@Component({
  components: {
    NoTokens,
    TransferHeaders,
    TransferInputs,
    TransactionList,
    NoChannelsDialog,
  },
  computed: {
    ...mapGetters(['tokens', 'channelWithBiggestCapacity', 'openChannels']),
  },
})
export default class TransferRoute extends Vue {
  tokens!: TokenModel[];
  channelWithBiggestCapacity!: (
    tokenAddress: string
  ) => RaidenChannel | undefined;

  get noTokens(): boolean {
    return this.tokens.length === 0;
  }

  get token(): Token | undefined {
    if (this.noTokens) {
      return undefined;
    } else {
      const { token } = this.$route.params;
      const address = token ? token : this.tokens[0].address;
      return this.$store.getters.token(address) || ({ address } as Token);
    }
  }

  get capacity(): BigNumber {
    if (this.token) {
      const channelWithBiggestCapacity = this.channelWithBiggestCapacity(
        this.token.address
      );
      return channelWithBiggestCapacity?.capacity ?? Zero;
    } else {
      return Zero;
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/mixins';

.transfer {
  &__menus,
  &__inputs,
  &__list {
    margin: 0 auto;
    width: 550px;

    @include respond-to(handhelds) {
      width: 100%;
    }
  }

  &__inputs,
  &__list {
    margin-top: 20px;
  }
}
</style>
