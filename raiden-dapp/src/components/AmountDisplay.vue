<template>
  <div
    @mouseover="exactAmount ? (displayExactAmount = true) : null"
    @mouseleave="exactAmount ? (displayExactAmount = false) : null"
  >
    <span v-if="displayExactAmount">
      {{ amount | toUnits(token.decimals) }} {{ token.symbol || '' }}
    </span>
    <span v-else>
      {{ amount | displayFormat(token.decimals) }}
      {{ token.symbol || '' }}
    </span>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { BigNumber } from 'ethers/utils';
import { Token } from '@/model/types';

@Component({})
export default class AmountDisplay extends Vue {
  @Prop({ required: false, default: false, type: Boolean })
  exactAmount!: boolean;
  @Prop({ required: true })
  amount!: string | BigNumber;
  @Prop({ required: true })
  token!: Token;

  displayExactAmount = false;
}
</script>
