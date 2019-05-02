<template>
  <fieldset id="token-amount">
    <v-text-field
      :disabled="disabled"
      :label="label"
      :rules="rules"
      :value="amount"
      @contextmenu="valueUpdated('contextmenu', $event)"
      @drop="valueUpdated('drop', $event)"
      @input.native="valueUpdated('input', $event)"
      @keydown="valueUpdated('keydown', $event)"
      @keyup="valueUpdated('keyup', $event)"
      @mousedown="valueUpdated('mousedown', $event)"
      @mouseup="valueUpdated('mouseup', $event)"
      @select="valueUpdated('select', $event)"
      background-color="transparent"
      flat
      id="amount"
      placeholder="0.00"
      ref="input"
      solo
    >
      <div class="prepend-placeholder" slot="prepend"></div>
      <div class="status-icon-wrapper" slot="append-outer">
        <v-icon class="status-icon" v-if="!valid" large>error</v-icon>
        <v-icon class="status-icon" v-else large>check_circle</v-icon>
      </div>

      <span class="token-symbol" slot="append">{{
        token.symbol || 'TKN'
      }}</span>
    </v-text-field>
  </fieldset>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({})
export default class AmountInput extends Vue {
  @Prop({ required: false })
  label?: string;
  @Prop({})
  disabled!: boolean;
  @Prop({ default: '0.00' })
  value!: string;
  @Prop()
  token?: Token;
  @Prop({ default: false, type: Boolean })
  limit!: boolean;

  valid: boolean = true;
  amount: string = '0.00';
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

  private oldValue: string = '0.00';
  private oldSelectionStart: number | null = 0;
  private oldSelectionEnd: number | null = 0;

  mounted() {
    this.amount = this.oldValue = this.value;
  }

  valueUpdated(eventName: string, event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target.value;

    /* istanbul ignore else */
    if (this.$refs.input) {
      const input = this.$refs.input as any;
      this.valid = input.valid;
    }

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
@import '../main';

$header-vertical-margin: 5rem;
$header-vertical-margin-mobile: 2rem;

#token-amount {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 60px;
  padding-bottom: 60px;
  border: 0;

  @include respond-to(handhelds) {
    padding-top: 30px;
    padding-bottom: 30px;
    border: 0;
  }
}

#token-amount /deep/ input {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 40px;
  font-weight: 500;
  line-height: 47px;
  text-align: center;
  max-height: 50px;
}
#token-amount /deep/ input:focus {
  outline: 0;
}

#token-amount /deep/ .v-text-field__details {
  height: 36px;
  padding-top: 4px;
}

#token-amount /deep/ .v-messages {
  color: white !important;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.token-symbol {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 20px;
  margin-top: -20px;
}

.status-icon-wrapper {
  padding: 8px;
}

.status-icon {
  color: #323232;
  background: white;
  border-radius: 50%;
  line-height: 28px;
  width: 28px;
}

.section {
  margin-top: $header-vertical-margin;
  margin-bottom: $header-vertical-margin;
  @include respond-to(handhelds) {
    margin-top: $header-vertical-margin-mobile;
    margin-bottom: $header-vertical-margin-mobile;
  }
}

.prepend-placeholder {
  width: 44px;
}
</style>
