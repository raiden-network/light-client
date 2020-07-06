<template>
  <fieldset class="amount-input">
    <div class="amount-input__label">{{ label }}</div>
    <v-text-field
      id="amount"
      ref="input"
      :class="{ invalid: !valid }"
      :disabled="disabled"
      :value="amount"
      :placeholder="placeholder"
      :error-messages="!hideErrorLabel ? errorMessages : []"
      autocomplete="off"
      :rules="isAmountValid"
      @input="onInput($event)"
      @paste="onPaste($event)"
    >
      <div slot="append" class="amount-input__token-symbol">
        {{ token.symbol || 'TKN' }}
      </div>
    </v-text-field>
  </fieldset>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch, Emit } from 'vue-property-decorator';
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
  @Prop()
  token?: Token;
  @Prop({ default: false, type: Boolean })
  limit!: boolean;
  @Prop({ required: true })
  value!: string;
  @Prop({ required: false, default: () => Zero })
  max!: BigNumber;
  @Prop({})
  disabled!: boolean;
  @Prop({ default: '', type: String })
  placeholder!: string;

  valid: boolean = true;
  amount: string = '';
  errorMessages: string[] = [];
  numericRegEx = /^\d*[.]?\d*$/;

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

  @Watch('errorMessages', { immediate: true })
  updateError() {
    this.inputError(this.errorMessages[0]);
  }

  @Emit()
  inputError(errorMessage: string) {
    return errorMessage;
  }

  get isAmountValid() {
    const isAmountValid = this.amount !== '' && this.errorMessages.length === 0;
    return [() => isAmountValid || ''];
  }

  mounted() {
    this.updateIfValid(this.value);
    this.errorMessages.pop();
  }

  onInput(value: string) {
    /* istanbul ignore else */
    if (this.$refs.input) {
      const input = this.$refs.input as any;
      this.valid = input.valid;
    }

    this.$emit('input', value);
  }

  onPaste(event: ClipboardEvent) {
    const clipboardData = event.clipboardData;

    if (!clipboardData) {
      return;
    }

    const value = clipboardData.getData('text');

    if (!this.numericRegEx.test(value)) {
      event.preventDefault();
    } else {
      const input = event.target as HTMLInputElement;
      input.setSelectionRange(0, input.value.length);
    }
  }

  updateIfValid(value: string) {
    this.errorMessages.pop();

    switch (false) {
      case this.noValidInput(value):
        this.errorMessages.push(
          this.$t('amount-input.error.invalid') as string
        );
        break;
      case this.noDecimalOverflow(value):
        this.errorMessages.push(
          this.$t('amount-input.error.too-many-decimals', {
            decimals: this.token!.decimals
          }) as string
        );
        break;
      case this.parsedAmount(value):
        this.errorMessages.push(this.$t('amount-input.error.zero') as string);
        break;
      case this.hasEnoughBalance(value, this.max):
        this.errorMessages.push(
          this.$t('amount-input.error.not-enough-funds', {
            funds: BalanceUtils.toUnits(this.max, this.token!.decimals ?? 18),
            symbol: this.token!.symbol
          }) as string
        );
        break;
      default:
        if (value !== this.amount && !Number.isNaN(Number(value))) {
          this.amount = value;
        }
    }
  }

  noValidInput(value: string): boolean {
    return !Number.isNaN(Number(value));
  }

  noDecimalOverflow(value: string): boolean {
    const validDecimalsCount =
      value &&
      !BalanceUtils.decimalsOverflow(value, this.token!.decimals ?? 18);

    return !this.limit || validDecimalsCount;
  }

  parsedAmount(value: string): boolean {
    let parsedAmount;

    try {
      parsedAmount = BalanceUtils.parse(value, this.token!.decimals!);
    } catch (e) {}

    const validParsedAmount = value && parsedAmount && !parsedAmount.isZero();
    return !this.limit || validParsedAmount;
  }

  hasEnoughBalance(value: string, max: BigNumber): boolean {
    const validBalance =
      value &&
      !Number.isNaN(Number(value)) &&
      !BalanceUtils.decimalsOverflow(value, this.token!.decimals!) &&
      BalanceUtils.parse(value, this.token!.decimals!).lte(max);

    return !this.limit || validBalance;
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
