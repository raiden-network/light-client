<template>
  <div class="transfer-summary">
    <h2 v-if="!isDirectTransfer" class="transfer-summary__header">
      {{ $t('transfer.steps.summary.route-request') }}
    </h2>

    <div v-if="!isDirectTransfer" class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.pfs') }}</span>
      <span class="transfer-summary__pfs-address">
        <v-tooltip bottom>
          <template #activator="{ on }">
            <span v-on="on">
              {{ transfer.pfsAddress.replace('https://', '') | truncate(28) }}
            </span>
          </template>
          <span>{{ transfer.pfsAddress }}</span>
        </v-tooltip>
      </span>
    </div>

    <div v-if="!isDirectTransfer" class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.service-fee') }}</span>
      <span class="transfer-summary__service-fee">
        {{
          transfer.serviceFee | displayFormat(transfer.serviceToken.decimals)
        }}
        {{ transfer.serviceToken.symbol || '' }}
        <checkmark class="transfer-summary__checkmark" />
      </span>
    </div>

    <h2 class="transfer-summary__header">
      {{
        isDirectTransfer
          ? $t('transfer.steps.summary.direct-transfer')
          : $t('transfer.steps.summary.mediated-transfer')
      }}
      <sup v-if="isDirectTransfer">
        {{ $t('transfer.steps.summary.footnotes.one') }}
      </sup>
    </h2>

    <div class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.target') }}</span>
      <span><address-display :address="transfer.target"/></span>
    </div>

    <div class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.transfer-amount') }}</span>
      <span class="transfer-summary__transfer-amount">
        {{
          transfer.transferAmount
            | displayFormat(transfer.transferToken.decimals)
        }}
        {{ transfer.transferToken.symbol || '' }}
      </span>
    </div>

    <div v-if="!isDirectTransfer" class="transfer-summary__row">
      <span>
        {{ $t('transfer.steps.summary.mediation-fee') }}
        <sup v-if="routeSelectionSkipped">
          {{ $t('transfer.steps.summary.footnotes.one') }}
        </sup>
      </span>
      <span class="transfer-summary__mediation-fee">
        {{
          transfer.mediationFee | displayFormat(transfer.transferToken.decimals)
        }}
        {{ transfer.transferToken.symbol || '' }}
      </span>
    </div>

    <hr class="transfer-summary__separator" />

    <div class="transfer-summary__row transfer-summary__row--total">
      <span>{{ $t('transfer.steps.summary.total-amount') }}</span>
      <span class="transfer-summary__transfer-total">
        {{
          transfer.transferTotal
            | displayFormat(transfer.transferToken.decimals)
        }}
        {{ transfer.transferToken.symbol || '' }}
      </span>
    </div>

    <ol class="transfer-summary__explanation">
      <li v-if="isDirectTransfer">
        {{ $t('transfer.steps.summary.footnotes.direct-transfer') }}
      </li>
      <li v-if="routeSelectionSkipped">
        {{ $t('transfer.steps.summary.footnotes.route-selection-skipped') }}
      </li>
    </ol>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Checkmark from '@/components/Checkmark.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';
import { Transfer } from '@/model/types';
import Filters from '@/filters';

@Component({ components: { Checkmark, AddressDisplay } })
export default class TransferSummary extends Vue {
  @Prop({ required: true })
  transfer!: Transfer;

  truncate = Filters.truncate;

  get isDirectTransfer() {
    return this.transfer.hops === 0;
  }

  get routeSelectionSkipped() {
    const { mediationFee } = this.transfer;
    return !this.isDirectTransfer && mediationFee && mediationFee.isZero();
  }
}
</script>

<style lang="scss" scoped>
.transfer-summary {
  width: 100%;

  &__header {
    margin-top: 25px;
    text-align: left;
  }

  &__row {
    justify-content: space-between;
    display: flex;
    position: relative;

    > span {
      display: flex;
      align-items: center;
    }

    &--total {
      font-weight: bold;
      font-size: 18px;
    }
  }

  &__checkmark {
    position: absolute;
    right: -26px;
    width: 16px;
    height: 16px;
  }

  &__separator {
    margin: 10px 0;
  }

  &__explanation {
    text-align: left;
    margin-top: 30px;
    list-style: none;
    counter-reset: item;
    padding-left: 7px;

    li {
      counter-increment: item;
      margin-bottom: 15px;
      position: relative;
      font-size: 12px;

      &:before {
        margin-right: 5px;
        content: counter(item);
        position: absolute;
        left: -10px;
        top: -4px;
        font-size: 10px;
      }
    }
  }
}
</style>
