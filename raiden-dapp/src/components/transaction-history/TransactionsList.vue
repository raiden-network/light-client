<template>
  <v-container class="transaction-history" fluid>
    <v-row class="transaction-history__title" no-gutters>
      {{ $t('transaction-history.title') }}
    </v-row>
    <v-list class="transaction-history__list" color="transparent">
      <div
        v-for="(transfer, index) in Object.values(transfers)"
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
import { Component, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { Transfers } from '../../types';
import Transaction from '@/components/transaction-history/Transaction.vue';

@Component({
  components: {
    Transaction
  },
  computed: {
    ...mapState(['transfers'])
  }
})
export default class TransactionLists extends Vue {
  transfers!: Transfers;
}
</script>

<style scoped lang="scss">
@import '../../scss/colors';

.transaction-history {
  &__title {
    color: $secondary-text-color;
    font-weight: bold;
    margin: 24px 0 0 32px;
  }

  &__list {
    margin: 0 34px 0 32px;

    > div {
      &:first-of-type {
        border: none;
      }
    }

    &__item {
      border-top: solid 1px $input-background;
      padding-top: 22px;
    }
  }
}
</style>
