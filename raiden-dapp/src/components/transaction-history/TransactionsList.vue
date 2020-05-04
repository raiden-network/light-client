<template>
  <v-container class="transaction-history" fluid>
    <v-row no-gutters>{{ $t('transaction-history.title') }}</v-row>
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

  mounted() {
    console.log(Object.values(this.transfers));
  }
}
</script>

<style scoped lang="scss">
@import '../../scss/colors';

.transaction-history {
  &__list {
    margin: 0 30px 0 30px;

    &__item {
      border-top: solid 1px $input-background;
      padding-top: 22px;
    }
  }
  &__list > div:first-of-type {
    border: none;
  }
}
</style>
