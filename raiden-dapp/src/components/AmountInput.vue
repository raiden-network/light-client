<template>
  <fieldset id="token-amount" :class="{ light, dark: !light, padded }">
    <v-text-field
      id="amount"
      ref="input"
      :class="{ light, invalid: !valid }"
      :disabled="disabled"
      :label="label"
      :rules="rules"
      :value="amount"
      background-color="transparent"
      autocomplete="off"
      hint="Please enter the amount you wish to deposit into this channel."
      persistent-hint
      :light="light"
      :dark="!light"
      flat
      placeholder="0.00"
      solo
      @contextmenu="valueUpdated('contextmenu', $event)"
      @drop="valueUpdated('drop', $event)"
      @input.native="valueUpdated('input', $event)"
      @keydown="valueUpdated('keydown', $event)"
      @keyup="valueUpdated('keyup', $event)"
      @mousedown="valueUpdated('mousedown', $event)"
      @mouseup="valueUpdated('mouseup', $event)"
      @select="valueUpdated('select', $event)"
    >
      <div slot="prepend" class="prepend-placeholder"></div>
      <div slot="append-outer" class="status-icon-wrapper">
        <v-img
          v-if="!valid"
          class="status-icon"
          :src="require('../assets/input_invalid.svg')"
        ></v-img>
        <v-img
          v-else
          :src="require('../assets/input_valid.svg')"
          class="status-icon status-icon--valid"
        ></v-img>
      </div>
    </v-text-field>
    <span class="token-symbol" :class="{ light }">{{
      token.symbol || 'TKN'
    }}</span>
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
  @Prop({ default: false, type: Boolean })
  light!: boolean;
  @Prop({ default: false, type: Boolean })
  padded!: boolean;

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
      !this.limit ||
      this.hasEnoughBalance(v) ||
      `Your maximum deposit amount is ${this.token!!.units}`
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
@import '../scss/colors';

$header-vertical-margin: 5rem;
$header-vertical-margin-mobile: 2rem;

.padded {
  padding-top: 60px;
  padding-bottom: 60px;
}

$dark_color: #050505;
$light_color: #ffffff;
$dark_border: #fbfbfb;
$light_border: #050505;
$dark_background: #1e1e1e;
$light_background: #e4e4e4;

.light {
  color: $dark_color !important;

  /deep/ input {
    color: $dark_color !important;
  }

  /deep/ .v-messages {
    color: $dark_color !important;
  }

  .invalid /deep/ .v-messages {
    border-color: $light_border;
    background-color: $light_background;
  }

  .invalid /deep/ .v-messages:after {
    border-color: $light_border;
    background-color: $light_background;
  }
}

.dark {
  color: $light_color !important;

  /deep/ input {
    color: $light_color !important;
  }

  /deep/ .v-messages {
    color: $error-tooltip-background !important;
    .v-messages__wrapper {
      color: white;
    }
  }

  .invalid /deep/ .v-messages {
    border-color: $error-tooltip-background;
    background-color: $error-tooltip-background;
  }

  .invalid /deep/ .v-messages:after {
    border-color: $error-tooltip-background;
    background-color: $error-tooltip-background;
  }
}

.invalid /deep/ .v-messages {
  border: 1px solid !important;
  border-radius: 5px;
}

.invalid /deep/ .v-messages:after {
  content: ' ';
  border: solid #050505;
  border-radius: 1px;
  border-width: 0 1px 1px 0;
  position: absolute;
  left: 50%;
  bottom: 90%;
  display: inline-block;
  padding: 3px;
  transform: rotate(-135deg);
  -webkit-transform: rotate(-135deg);
}

#token-amount {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border: 0;

  @include respond-to(handhelds) {
    padding-top: 30px;
    padding-bottom: 30px;
    border: 0;
  }
}

#token-amount /deep/ input {
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
  padding-top: 8px;
  margin-top: 16px;
}

#token-amount /deep/ .v-messages {
  border: 1px solid transparent;
  font-family: Roboto, sans-serif;
  font-size: 13px;
  line-height: 18px;
  text-align: center;
  margin-top: 15px;

  .v-messages__wrapper {
    height: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
}

#token-amount /deep/ .v-messages:after {
  padding: 3px;
}

.token-symbol {
  font-family: Roboto, sans-serif;
  color: $secondary-color;
  font-weight: 500;
  font-size: 16px;
  line-height: 20px;
  margin-top: -85px;
}

.status-icon-wrapper {
  padding: 8px;
}

.status-icon {
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
