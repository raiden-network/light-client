<template>
  <div class="transaction-history">
    <v-row no-gutters class="transaction-history__heading">
      {{ $t('transfer-history.title') }}
    </v-row>
    <v-row class="transaction-history__transactions" no-gutters>
      <v-list class="transaction-history__transactions__list">
        <div
          v-for="(transfer, index) in orderedTransfers"
          :key="index"
          class="transaction-history__transactions__list__item"
        >
          <v-lazy transition="fade-transition" :options="{ threshold: 0.7 }" min-height="74">
            <transaction :transfer="transfer" />
          </v-lazy>
        </div>
      </v-list>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { Transfers } from '../../types';
import { RaidenTransfer } from 'raiden-ts';
import { Token } from '@/model/types';
import Transaction from '@/components/transaction-history/Transaction.vue';

@Component({
  components: {
    Transaction,
  },
  computed: {
    ...mapState(['transfers']),
  },
})
export default class TransactionLists extends Vue {
  @Prop()
  token: Token | undefined;

  transfers!: Transfers;

  get filteredTransfersForToken(): RaidenTransfer[] {
    const transferList = Object.values(this.transfers);

    if (this.token !== undefined) {
      return transferList.filter((transfer) => transfer.token === this.token!.address);
    } else {
      return transferList;
    }
  }

  get orderedTransfers(): RaidenTransfer[] {
    return this.filteredTransfersForToken.sort(
      (a: RaidenTransfer, b: RaidenTransfer) =>
        b.changedAt.getMilliseconds() - a.changedAt.getMilliseconds(),
    );
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';
@import '@/scss/mixins';

.transaction-history {
  background-color: $transfer-screen-bg-color;
  border-radius: 15px;
  height: 100%;
  padding-bottom: 10px;

  &__heading {
    font-size: 18px;
    height: 50px;
    padding: 16px 0 0 22px;
  }

  &__transactions {
    height: calc(300px - 50px);
    overflow-y: scroll;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
    @include respond-to(handhelds) {
      height: calc(260px - 50px);
    }

    &__list {
      margin: 0 23px 0 23px;
      width: 100%;

      > div {
        &:first-of-type {
          border: none;
          padding-top: 0px;
        }
      }

      &__item {
        border-top: solid 1px $input-background;
        padding-top: 22px;
      }
    }
  }
}
</style>
