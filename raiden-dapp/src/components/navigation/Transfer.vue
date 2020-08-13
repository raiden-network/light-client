<template>
  <v-container class="transfer">
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
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import TransferHeaders from '@/components/transfer/TransferHeaders.vue';
import TransferInputs from '@/components/transfer/TransferInputs.vue';
import TransactionList from '@/components/transaction-history/TransactionList.vue';
import { RaidenChannel } from 'raiden-ts';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';
import { Token } from '@/model/types';

@Component({
  components: {
    TransferHeaders,
    TransferInputs,
    TransactionList,
  },
  computed: {
    ...mapGetters(['channelWithBiggestCapacity']),
  },
})
export default class Transfer extends Vue {
  channelWithBiggestCapacity!: (
    tokenAddress: string
  ) => RaidenChannel | undefined;

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.$store.getters.token(address) || ({ address } as Token);
  }

  get capacity(): BigNumber {
    const channelWithBiggestCapacity = this.channelWithBiggestCapacity(
      this.token.address
    );

    if (channelWithBiggestCapacity) {
      return channelWithBiggestCapacity.capacity;
    }

    return Zero;
  }
}
</script>

<style lang="scss" scoped>
@import '../../scss/mixins';

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
