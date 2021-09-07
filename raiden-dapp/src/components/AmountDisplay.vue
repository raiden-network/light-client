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
    <span v-if="label">{{ label }}</span>
    <span v-if="displayExactAmount">
      {{ sign }}{{ amount | toUnits(token.decimals) }} {{ token.symbol || '' }}
    </span>
    <span v-else>
      {{ sign }}{{ amount | displayFormat(token.decimals) }}
      {{ token.symbol || '' }}
    </span>
  </div>
</template>

<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Prop, Vue } from 'vue-property-decorator';

import type { Token } from '@/model/types';

@Component({})
export default class AmountDisplay extends Vue {
  @Prop({ required: false, default: false, type: Boolean })
  exactAmount!: boolean;

  @Prop({ type: String, default: '' })
  label!: string;

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

  displayExactAmount = false;
}
</script>

<style lang="scss" scoped>
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
}
</style>
