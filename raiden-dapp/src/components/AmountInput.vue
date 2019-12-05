<template>
  <fieldset class="amount-input">
    <div class="amount-input__label">
      {{ label }}
    </div>
    <v-text-field
      id="amount"
      ref="input"
      :class="{ invalid: !valid }"
      :disabled="disabled"
      :rules="rules"
      :value="amount"
      :placeholder="placeholder"
      autocomplete="off"
      @paste="onPaste($event)"
      @keypress="checkIfValid($event)"
      @input="onInput($event)"
    >
      <div slot="append" class="amount-input__token-symbol">
        {{ token.symbol || 'TKN' }}
      </div>
    </v-text-field>
  </fieldset>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';

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
  @Prop({ default: '0.0', type: String })
  placeholder!: string;
  @Prop({ required: false, default: () => Zero })
  max!: BigNumber;

  valid: boolean = true;
  amount: string = '';
  private static numericRegex = /^\d*[.]?\d*$/;

  readonly rules = [
    (v: string) => {
      return !!v || this.$parent.$t('amount-input.error.empty');
    },
    (v: string) =>
      !this.limit ||
      (v && this.noDecimalOverflow(v)) ||
      this.$parent.$t('amount-input.error.too-many-decimals', {
        decimals: this.token!.decimals
      }),
    (v: string) => {
      let parsedAmount;
      try {
        parsedAmount = BalanceUtils.parse(v, this.token!.decimals!);
      } catch (e) {}
      return (
        !this.limit ||
        (v && parsedAmount && !parsedAmount.isZero()) ||
        this.$parent.$t('amount-input.error.zero')
      );
    },
    (v: string) =>
      !this.limit ||
      (v && this.hasEnoughBalance(v, this.max)) ||
      this.$parent.$t('amount-input.error.not-enough-funds', {
        funds: BalanceUtils.toUnits(this.max, this.token!.decimals || 18),
        symbol: this.token!.symbol
      })
  ];

  private noDecimalOverflow(v: string) {
    return (
      AmountInput.numericRegex.test(v) &&
      !BalanceUtils.decimalsOverflow(v, this.token!.decimals || 18)
    );
  }

  private hasEnoughBalance(v: string, max: BigNumber) {
    return (
      AmountInput.numericRegex.test(v) &&
      !BalanceUtils.decimalsOverflow(v, this.token!.decimals!) &&
      BalanceUtils.parse(v, this.token!.decimals!).lte(max)
    );
  }

  private updateIfValid(value: string) {
    if (value !== this.amount && AmountInput.numericRegex.test(value)) {
      this.amount = value;
    }
  }

  @Watch('value')
  onChange(value: string) {
    this.updateIfValid(value);
  }

  @Watch('token')
  onTokenUpdate() {
    (this.$refs.input as any).validate();
  }

  mounted() {
    this.updateIfValid(this.value);
  }

  checkIfValid(event: KeyboardEvent) {
    if (
      !/[\d.]/.test(event.key) ||
      (!this.value && event.key === '.') ||
      (this.value.indexOf('.') > -1 && event.key === '.')
    ) {
      event.preventDefault();
    }
  }

  onPaste(event: ClipboardEvent) {
    const clipboardData = event.clipboardData;

    if (!clipboardData) {
      return;
    }

    const value = clipboardData.getData('text');
    if (!AmountInput.numericRegex.test(value)) {
      event.preventDefault();
    } else {
      const input = event.target as HTMLInputElement;
      input.setSelectionRange(0, input.value.length);
    }
  }

  onInput(value: string) {
    /* istanbul ignore else */
    if (this.$refs.input) {
      const input = this.$refs.input as any;
      this.valid = input.valid;
    }

    this.$emit('input', value);
  }
}
</script>

<style scoped lang="scss">
@import '../main';
@import '../scss/colors';

$header-vertical-margin: 5rem;
$header-vertical-margin-mobile: 2rem;

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

  ::v-deep {
    .v-input__slot {
      border-radius: 10px;
      background-color: $input-background !important;
      padding: 8px 16px;
      max-height: 49px;
      border: 1.5px solid transparent;

      &::before,
      &::after {
        border-width: 0 0 0 0;
      }
    }

    .v-input--is-focused {
      .v-input__slot {
        border: 1.5px solid $primary-color;
      }
    }

    .v-input {
      width: 100%;
    }

    input {
      font-family: Roboto, sans-serif;
      font-size: 16px;
      line-height: 20px;
      caret-color: white !important;

      &:focus {
        outline: 0;
      }
    }

    .v-messages {
      border: 1px solid transparent;
      font-family: Roboto, sans-serif;
      font-size: 14px;
      line-height: 16px;

      .v-messages__wrapper {
        height: 25px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding-left: 20px;
        justify-content: center;
        color: white;
      }
    }
  }
}

.amount-input__token-symbol {
  font-family: Roboto, sans-serif;
  color: $text-color;
  font-weight: 500;
  font-size: 14px;
  line-height: 27px;
  text-align: center;
}

.amount-input__label {
  color: $secondary-color;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 3px;
  line-height: 15px;
  text-transform: uppercase;
  text-align: left;
  width: 100%;
}
</style>
