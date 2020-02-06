<template>
  <div class="transfer-summary">
    <h2>{{ $t('transfer.steps.summary.route-request') }}</h2>

    <div class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.pfs') }}</span>
      <span>{{ transfer.pfsAddress }}</span>
    </div>

    <div class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.service-fee') }}</span>
      <span>
        {{
          transfer.serviceFee | displayFormat(transfer.serviceToken.decimals)
        }}
        {{ transfer.serviceToken.symbol || '' }}
        <checkmark class="transfer-summary__checkmark" />
      </span>
    </div>

    <h2>
      {{
        transfer.mediationFee
          ? $t('transfer.steps.summary.mediated-transfer')
          : $t('transfer.steps.summary.direct-transfer')
      }}
    </h2>

    <div class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.target') }}</span>
      <span>{{ transfer.target }}</span>
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

    <div v-if="transfer.mediationFee" class="transfer-summary__row">
      <span>{{ $t('transfer.steps.summary.mediation-fee') }}</span>
      <span>
        {{
          transfer.mediationFee | displayFormat(transfer.transferToken.decimals)
        }}
        {{ transfer.transferToken.symbol || '' }}
      </span>
    </div>

    <hr />

    <div class="transfer-summary__row">
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
import { Transfer } from '@/model/types';

@Component({ components: { Checkmark } })
export default class NoTokens extends Vue {
  @Prop({ required: true })
  transfer!: Transfer;
}
</script>

<style lang="scss" scoped>
.transfer-summary {
  width: 100%;

  &__row {
    justify-content: space-between;
    display: flex;

    & > span {
      display: flex;
      align-items: center;
    }
  }

  &__checkmark {
    margin-left: 10px;
    width: 16px;
    height: 16px;
  }
}
</style>
