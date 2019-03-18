<template>
  <fieldset id="token-amount">
    <v-text-field
      :disabled="disabled"
      :label="label"
      :rules="rules"
      v-bind:value="amount"
      class="dense-inputs"
      id="amount"
      placeholder="0.0"
      v-on:input.native="valueUpdated('input', $event)"
      outline
      v-on:keydown="valueUpdated('keydown', $event)"
      v-on:keyup="valueUpdated('keyup', $event)"
      v-on:mousedown="valueUpdated('mousedown', $event)"
      v-on:mouseup="valueUpdated('mouseup', $event)"
      v-on:select="valueUpdated('select', $event)"
      v-on:contextmenu="valueUpdated('contextmenu', $event)"
      v-on:drop="valueUpdated('drop', $event)"
    >
    </v-text-field>
  </fieldset>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Token } from '@/model/token';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({})
export default class AmountInput extends Vue {
  @Prop({ required: false })
  label!: string;
  @Prop({})
  disabled!: boolean;
  @Prop({ default: '0.0' })
  value!: string;
  @Prop()
  token?: Token;
  @Prop({ default: false, type: Boolean })
  limit!: boolean;

  amount: string = '0.0';
  private static numericRegex = /^\d*[.,]?\d*$/;

  readonly rules = [
    (v: string) => !!v || 'The amount cannot be empty',
    (v: string) =>
      !this.limit ||
      this.noDecimalOverflow(v) ||
      `The token supports only up to ${this.token!!.decimals} decimals`,
    (v: string) =>
      !this.limit || this.hasEnoughBalance(v) || 'Insufficient balance'
  ];

  private noDecimalOverflow(v: string) {
    return (
      v &&
      AmountInput.numericRegex.test(v) &&
      !BalanceUtils.decimalsOverflow(v, this.token!!)
    );
  }

  private hasEnoughBalance(v: string) {
    return (
      v &&
      AmountInput.numericRegex.test(v) &&
      !BalanceUtils.decimalsOverflow(v, this.token!!) &&
      BalanceUtils.hasBalance(v, this.token!!)
    );
  }

  private oldValue: string = '0.0';
  private oldSelectionStart: number | null = 0;
  private oldSelectionEnd: number | null = 0;

  mounted() {
    this.amount = this.oldValue = this.value;
  }

  valueUpdated(eventName: string, event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    if (AmountInput.numericRegex.test(value)) {
      this.$emit(eventName, value);
      this.oldValue = value;
      this.oldSelectionStart = target.selectionStart;
      this.oldSelectionEnd = target.selectionEnd;
    } else {
      target.value = this.oldValue;
      if (this.oldSelectionStart && this.oldSelectionEnd) {
        target.setSelectionRange(this.oldSelectionStart, this.oldSelectionEnd);
      }
    }
  }
}
</script>

<style scoped lang="scss">
#token-amount {
  border: 0;
}

$header-vertical-margin: 5rem;

#token-amount /deep/ input {
  font-size: 60px;
  padding: 10px;
  width: 100%;
  color: #666;
  border-radius: 7px 7px 7px 7px;
  max-height: 80px;
  font-weight: 300;
}
#token-amount /deep/ input:focus {
  outline: 0;
}

.section {
  margin-top: $header-vertical-margin;
  margin-bottom: $header-vertical-margin;
}
</style>
