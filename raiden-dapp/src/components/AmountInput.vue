<template>
  <fieldset class="amount-input">
    <v-text-field
      id="amount"
      ref="input"
      :class="{ invalid: !valid }"
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
      :placeholder="placeholder"
      autocomplete="off"
      solo
      flat
    >
      <div slot="append" class="amount-input__token-symbol">
        {{ token.symbol || 'TKN' }}
      </div>
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
  @Prop({ default: false, type: Boolean })
  light!: boolean;
  @Prop({ default: false, type: Boolean })
  padded!: boolean;
  @Prop({ default: '0.0', type: String })
  placeholder!: string;

  valid: boolean = true;
  amount: string = '';
  private static numericRegex = /^\d*[.,]?\d*$/;

  readonly rules = [
    (v: string) => {
      return !!v || this.$parent.$t('amount-input.error.empty');
    },
    (v: string) =>
      !this.limit ||
      this.noDecimalOverflow(v) ||
      this.$parent.$t('amount-input.error.too-many-decimals', {
        decimals: this.token!!.decimals
      }),
    (v: string) =>
      !this.limit ||
      this.hasEnoughBalance(v) ||
      this.$parent.$t('amount-input.error.not-enough-funds', {
        funds: this.token!!.units
      })
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

.invalid ::v-deep .v-messages {
  border: 1px solid !important;
  border-radius: 5px;
}

.invalid ::v-deep .v-messages:after {
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

.amount-input {
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

.amount-input ::v-deep .v-input__slot {
  border-radius: 10px;
  background-color: $input-background !important;
  padding: 8px 16px;
  max-height: 49px;
}

.amount-input ::v-deep .v-input {
  width: 100%;
}

.amount-input ::v-deep input {
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 20px;
}

.amount-input ::v-deep input:focus {
  outline: 0;
}

.amount-input ::v-deep .v-messages {
  border: 1px solid transparent;
  font-family: Roboto, sans-serif;
  font-size: 13px;
  line-height: 18px;
  text-align: center;

  .v-messages__wrapper {
    height: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
}

.amount-input__token-symbol {
  font-family: Roboto, sans-serif;
  color: $text-color;
  font-weight: 500;
  font-size: 14px;
  line-height: 16px;
  text-align: center;
}
</style>
