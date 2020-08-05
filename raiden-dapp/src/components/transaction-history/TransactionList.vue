<template>
  <v-container class="transaction-history" fluid>
    <v-list class="transaction-history__list" color="transparent">
      <div
        v-for="(transfer, index) in orderedTransfers"
        :key="index"
        class="transaction-history__list__item"
      >
        <v-lazy
          transition="fade-transition"
          :options="{ threshold: 0.7 }"
          min-height="74"
        >
          <transaction :transfer="transfer" />
        </v-lazy>
      </div>
    </v-list>
  </v-container>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { RaidenTransfer } from 'raiden-ts';
import { Token } from '@/model/types';
import { Transfers } from '../../types';
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
      return transferList.filter(
        (transfer) => transfer.token === this.token!.address
      );
    } else {
      return transferList;
    }
  }

  get orderedTransfers(): RaidenTransfer[] {
    return this.filteredTransfersForToken.sort(
      (a: any, b: any) => b.changedAt - a.changedAt
    );
  }
}
</script>

<style scoped lang="scss">
@import '../../scss/colors';

.transaction-history {
  &__list {
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
</style>
