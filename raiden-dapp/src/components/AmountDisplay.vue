<template>
  <div
    class="amount-display"
    :class="{
      'amount-display--inline': inline,
      'amount-display--full-width': fullWidth,
    }"
    @mouseover="exactAmount ? (displayExactAmount = true) : null"
    @mouseleave="exactAmount ? (displayExactAmount = false) : null"
  >
    <span v-if="showLabel" class="amount-display__label">
      {{ label }}
    </span>

    <slot>
      <span
        class="amount-display__formatted-amount"
        :class="{ 'amount-display__formatted-amount--warning': warning }"
      >
        {{ formattedAmount }}
      </span>
    </slot>
  </div>
</template>

<script lang="ts">
import { BigNumber } from 'ethers';
import { Component, Prop, Vue } from 'vue-property-decorator';

import Filters from '@/filters';
import type { Token } from '@/model/types';

@Component
export default class AmountDisplay extends Vue {
  @Prop({ required: false, default: false, type: Boolean })
  exactAmount!: boolean;

  @Prop({ type: String, required: false })
  label?: string;

  @Prop({ required: true })
  amount!: string | BigNumber;

  @Prop({ type: String, default: '' })
  sign!: string;

  @Prop({ required: true })
  token!: Token;

  @Prop({ required: false, default: false, type: Boolean })
  inline!: boolean;

  @Prop({ type: Boolean, default: false })
  fullWidth!: boolean;

  @Prop({ type: Boolean, default: false })
  warning!: boolean;

  displayExactAmount = false;

  get showLabel(): boolean {
    return this.label !== undefined;
  }

  get exactAmountValue(): string {
    const amount = BigNumber.from(this.amount);
    return Filters.toUnits(amount, this.token.decimals);
  }

  get roundedAmountValue(): string {
    const amount = BigNumber.from(this.amount);
    return Filters.displayFormat(amount, this.token.decimals);
  }

  get formattedAmount(): string {
    let formattedAmount = this.sign;
    formattedAmount += this.displayExactAmount ? this.exactAmountValue : this.roundedAmountValue;
    formattedAmount += ' ' + this.token.symbol;
    return formattedAmount;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';

.amount-display {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;

  &--inline {
    display: inline;
  }

  &--full-width {
    width: 100%;
  }

  &__formatted-amount {
    &--warning {
      color: $error-color;
    }
  }
}
</style>
