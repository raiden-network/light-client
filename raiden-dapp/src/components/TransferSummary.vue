<template>
  <div class="transfer-summary">
    <h2 v-if="!isDirectTransfer" class="transfer-summary__header">
      {{ $t('transfer.steps.summary.route-request') }}
    </h2>

    <div v-if="!isDirectTransfer" class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.pfs') }}</span>
      <span>
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

    <div
      v-if="transfer.serviceFee && transfer.serviceToken"
      class="transfer-summary__row"
    >
      <span>{{ $t('transfer.steps.summary.service-fee') }}</span>
      <span>
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
    </h2>

    <div class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.target') }}</span>
      <span><address-display :address="transfer.target"/></span>
    </div>

    <div class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.transfer-amount') }}</span>
      <span>
        {{
          transfer.transferAmount
            | displayFormat(transfer.transferToken.decimals)
        }}
        {{ transfer.transferToken.symbol || '' }}
      </span>
    </div>

    <div v-if="!isDirectTransfer" class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.mediation-fee') }}</span>
      <span>
        {{
          transfer.mediationFee | displayFormat(transfer.transferToken.decimals)
        }}
        {{ transfer.transferToken.symbol || '' }}
      </span>
    </div>

    <hr class="transfer-summary__separator" />

    <div class="transfer-summary__row transfer-summary__row--total">
      <span>{{ $t('transfer.steps.summary.total-amount') }}</span>
      <span>
        {{
          transfer.transferTotal
            | displayFormat(transfer.transferToken.decimals)
        }}
        {{ transfer.transferToken.symbol || '' }}
      </span>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import Checkmark from '@/components/Checkmark.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';
import { Transfer } from '@/model/types';
import Filters from '@/filters';

@Component({ components: { Checkmark, AddressDisplay } })
export default class NoTokens extends Vue {
  @Prop({ required: true })
  transfer!: Transfer;

  truncate = Filters.truncate;

  get isDirectTransfer() {
    return this.transfer.hops === 0;
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

    & > span {
      display: flex;
      align-items: center;
    }

    &--total {
      font-weight: bold;
      font-size: 18px;
    }
  }

  &__checkmark {
    margin-left: 10px;
    width: 16px;
    height: 16px;
  }

  &__separator {
    margin: 10px 0;
  }
}
</style>
