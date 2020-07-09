<template>
  <fieldset class="amount-input">
    <div class="amount-input__label">{{ label }}</div>
    <v-text-field
      id="amount"
      ref="input"
      :class="{ invalid: !valid }"
      :disabled="disabled"
      :value="amount"
      :error-messages="errorMessages"
      :placeholder="placeholder"
      :hide-details="hideErrorLabel"
      autocomplete="off"
      @paste="onPaste($event)"
      @input="onInput($event)"
    >
      <div slot="append" class="amount-input__token-symbol">
        {{ token.symbol || 'TKN' }}
      </div>
    </v-text-field>
  </fieldset>
</template>

<script lang="ts">
import { Component, Prop, Vue, Emit, Watch } from 'vue-property-decorator';
import { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';
@Component({})
export default class AmountInput extends Vue {
  @Prop({ required: false })
  label?: string;
  @Prop({ required: false, default: false, type: Boolean })
  hideErrorLabel!: boolean;
  @Prop({})
  disabled!: boolean;
  @Prop({ required: true })
  value!: string;
  @Prop()
  token?: Token;
  @Prop({ default: false, type: Boolean })
  limit!: boolean;
  @Prop({ default: '', type: String })
  placeholder!: string;
  @Prop({ required: false, default: () => Zero })
  max!: BigNumber;
  valid: boolean = true;
  amount: string = '';
  private static numericRegex = /^\d*[.]?\d*$/;

  readonly rules = [
    (v: string) => !!v || '',
    (v: string) =>
      !Number.isNaN(Number(v)) || this.$parent.$t('amount-input.error.invalid'),
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
        funds: BalanceUtils.toUnits(this.max, this.token!.decimals ?? 18),
        symbol: this.token!.symbol
      })
  ];

  get errorMessages(): any[] {
    return this.rules
      .map((rule) => rule(this.value))
      .filter((res) => {
        return res !== true;
      });
  }

  private noDecimalOverflow(v: string) {
    return (
      AmountInput.numericRegex.test(v) &&
      !BalanceUtils.decimalsOverflow(v, this.token!.decimals ?? 18)
    );
  }

  private hasEnoughBalance(v: string, max: BigNumber) {
    return (
      !Number.isNaN(Number(v)) &&
      !BalanceUtils.decimalsOverflow(v, this.token!.decimals!) &&
      BalanceUtils.parse(v, this.token!.decimals!).lte(max)
    );
  }

  private updateIfValid(value: string) {
    if (value !== this.amount && !Number.isNaN(Number(value))) {
      this.amount = value;
    }
  }

  @Watch('value', { immediate: true })
  onChange(value: string | undefined) {
    if (value === undefined) {
      return;
    }
    this.updateIfValid(value);
  }

  @Watch('token')
  onTokenUpdate() {
    (this.$refs.input as any).validate();
  }

  @Watch('errorMessages')
  updateError() {
    this.inputError(this.errorMessages[0]);
  }

  @Emit()
  inputError(errorMessage: string) {
    return errorMessage;
  }

  @Emit()
  mounted() {
    this.updateIfValid(this.value);
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
@import '../scss/mixins';
@import '../scss/colors';
@import '../scss/fonts';
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
    .v-input {
      width: 100%;
      &__slot {
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
      &--is-focused {
        .v-input {
          &__slot {
            border: 1.5px solid $primary-color;
          }
        }
      }
    }
    input {
      font-family: $main-font;
      font-size: 16px;
      line-height: 20px;
      caret-color: white !important;
      &:focus {
        outline: 0;
      }
    }
    .v-messages {
      border: 1px solid transparent;
      font-family: $main-font;
      font-size: 14px;
      line-height: 16px;
      &__wrapper {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding-left: 20px;
        justify-content: center;
        color: white;
        @include respond-to(handhelds) {
          padding-left: 10px;
        }
      }
      &__message {
        color: $secondary-text-color;
        line-height: 1.1;
      }
    }
  }
  &__token-symbol {
    font-family: $main-font;
    color: $text-color;
    font-weight: 500;
    font-size: 14px;
    line-height: 21px;
    text-align: center;
  }
  &__label {
    color: $secondary-color;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 3px;
    line-height: 15px;
    text-transform: uppercase;
    text-align: left;
    width: 100%;
  }
}
</style>
