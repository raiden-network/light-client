<template>
  <div
    class="planned-udc-withdrawal-information d-flex justify-center align-center px-2"
    :class="{
      'planned-udc-withdrawal-information--no-progress': noWithdrawInProgress,
      'planned-udc-withdrawal-information--pending': isPending,
      'planned-udc-withdrawal-information--ready': isReady,
    }"
  >
    <template v-if="noWithdrawInProgress">
      {{ $t('udc.information.no-withdrawal-in-progress') | upperCase }}
    </template>

    <template v-else>
      <img
        class="planned-udc-withdrawal-information__status-icon mr-2"
        :src="require(`@/assets/planned-udc-withdrawal/status-icon-${statusIconName}.svg`)"
        width="13px"
        height="13px"
      />

      <amount-display
        class="planned-udc-withdrawal-information__amount"
        :token="udcToken"
        :amount="plannedWithdrawal.amount"
      />

      <v-spacer />

      <span v-if="isPending" class="planned-udc-withdrawal-information__message">
        {{ remainingBlocksUntilReady }}
        {{ $t('udc.information.pending-message') | upperCase }}
      </span>

      <span v-if="isReady" class="planned-udc-withdrawal-information__message">
        {{ $t('udc.information.ready-message') | upperCase }}
      </span>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Prop } from 'vue-property-decorator';

import AmountDisplay from '@/components/AmountDisplay.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { Token } from '@/model/types';
import type { PlannedUdcWithdrawal } from '@/store/user-deposit-contract';

@Component({ components: { AmountDisplay } })
export default class PlannedUdcWithdrawalInformation extends NavigationMixin {
  @Prop()
  plannedWithdrawal!: PlannedUdcWithdrawal | undefined;

  @Prop({ required: true })
  udcToken!: Token;

  @Prop({ required: true })
  blockNumber!: number;

  readonly assetSourceDirectory = '@/assets/planned-udc-withdrawal';

  get noWithdrawInProgress(): boolean {
    return this.plannedWithdrawal === undefined;
  }

  get isPending(): boolean {
    return this.plannedWithdrawal !== undefined && this.remainingBlocksUntilReady > 0;
  }

  get isReady(): boolean {
    return this.plannedWithdrawal !== undefined && this.remainingBlocksUntilReady <= 0;
  }

  get remainingBlocksUntilReady(): number {
    return this.plannedWithdrawal !== undefined
      ? this.plannedWithdrawal.withdrawBlock - this.blockNumber
      : 0;
  }

  get statusIconName(): string {
    return this.isReady ? 'ready' : this.isPending ? 'pending' : '';
  }
}
</script>

<style lang="scss">
.planned-udc-withdrawal-information {
  width: 100%;
  height: 24px;
  font-size: 12px;
  border-radius: 8px;

  &--no-progress {
    color: #7a7a80;
    background-color: #232323;
  }

  &--pending {
    color: #ffc700;
    background-color: #293300;
  }

  &--ready {
    color: #00ff66;
    background-color: #003214;
  }

  &__amount {
    font-size: 15px;
  }
}
</style>
