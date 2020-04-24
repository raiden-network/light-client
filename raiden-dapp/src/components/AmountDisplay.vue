<template>
  <div
    @mouseover="exactAmount ? (displayExactAmount = true) : null"
    @mouseleave="exactAmount ? (displayExactAmount = false) : null"
  >
    <span v-if="displayExactAmount">{{ amount }} {{ symbol }}</span>
    <span v-else>
      {{ amount | displayFormat(amount.decimals) }} {{ symbol }}
    </span>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { BigNumber } from 'ethers/utils';

@Component({})
export default class AmountDisplay extends Vue {
  @Prop({ required: false, default: false, type: Boolean })
  exactAmount!: boolean;
  @Prop({ required: true })
  amount!: string | BigNumber;
  @Prop({ required: false })
  symbol!: string;

  displayExactAmount = false;
}
</script>
