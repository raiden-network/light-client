<template>
  <fieldset data-cy="address_input" class="address-input">
    <v-text-field
      id="address-input"
      ref="address"
      v-model="address"
      :disabled="disabled"
      :error-messages="errorMessages"
      :rules="isAddressValid"
      :hide-details="hideErrorLabel"
      :class="{
        'address-input--invalid': !valid && touched,
        'address-input--untouched': !touched,
      }"
      :placeholder="$t('address-input.input.placeholder')"
      persistent-hint
      @blur="$emit('blur')"
      @focus="$emit('focus')"
      @input="valueChanged"
      @change="valueChanged"
    >
      <template #prepend-inner>
        <div
          v-if="value && isChecksumAddress(value)"
          class="address-input__availability"
          :class="{
            'address-input__availability--online': isAddressAvailable,
            'address-input__availability--offline': !isAddressAvailable,
          }"
        >
          <img
            :src="$blockie(value)"
            :alt="$t('address-input.blockie-alt')"
            class="address-input__blockie"
          />
        </div>
      </template>
      <template #append>
        <span v-if="!busy" class="address-input__qr-code">
          <qr-code @click.native="isQrCodeOverlayVisible = !isQrCodeOverlayVisible" />
        </span>
        <div v-else>
          <spinner :size="22" :width="2" :inline="true" />
        </div>
      </template>
    </v-text-field>
    <qr-code-overlay
      :visible="isQrCodeOverlayVisible"
      @cancel="isQrCodeOverlayVisible = false"
      @decode="onDecode"
    />
  </fieldset>
</template>

<script lang="ts">
import debounce from 'lodash/debounce';
import { Component, Emit, Mixins, Prop, Watch } from 'vue-property-decorator';
import type { VTextField } from 'vuetify/lib';
import { mapState } from 'vuex';

import QrCode from '@/components/icons/QrCode.vue';
import Spinner from '@/components/icons/Spinner.vue';
import QrCodeOverlay from '@/components/overlays/QrCodeOverlay.vue';
import BlockieMixin from '@/mixins/blockie-mixin';
import type { Presences } from '@/model/types';
import AddressUtils from '@/utils/address-utils';

type ValidationResult = {
  error?: string;
  value: string;
  isAddress?: boolean;
};

const ETHSUM = 'https://ethsum.netlify.com';

@Component({
  components: { QrCode, QrCodeOverlay, Spinner },
  computed: { ...mapState(['presences']) },
})
export default class AddressInput extends Mixins(BlockieMixin) {
  @Prop({ required: false, default: false, type: Boolean })
  hideErrorLabel!: boolean;
  @Prop()
  disabled!: boolean;
  @Prop({ required: true })
  value!: string;

  @Prop({
    default: function () {
      return [''];
    },
  })
  exclude!: Array<string>;

  @Prop({ type: String, default: 'address-input.error.invalid-excluded-address' })
  excludeErrorMessage!: string;

  @Prop({ default: () => [] })
  restricted!: string[];

  @Prop({ type: String, default: 'address-input.error.invalid-restricted-address' })
  restrictedErrorMessage!: string;

  @Emit()
  inputError(errorMessage: string) {
    return errorMessage;
  }

  @Watch('errorMessages', { immediate: true })
  updateError() {
    this.inputError(this.errorMessages[0]);
  }

  address = '';

  typing = false;
  valid = false;
  touched = false;
  errorMessages: string[] = [];
  busy = false;
  presences!: Presences;
  isAddressAvailable = false;
  isQrCodeOverlayVisible = false;

  $refs!: {
    address: VTextField;
  };

  get isAddressValid() {
    // v-text-field interprets strings returned from a validation rule
    // as the input being invalid. Since the :rules prop does not support
    // async rules we have to workaround with a reactive prop
    const isAddressValid =
      this.address &&
      this.address.trim() !== '' &&
      !this.busy &&
      !this.typing &&
      this.errorMessages.length === 0 &&
      this.isAddressAvailable;

    if (isAddressValid) {
      this.input(this.address);
    }

    return [() => isAddressValid || ''];
  }

  private async checkAvailability(value: ValidationResult): Promise<ValidationResult> {
    if (value.error) return value;
    this.busy = true;
    try {
      let available;
      if (value.value in this.presences) available = this.presences[value.value];
      else available = await this.$raiden.getAvailability(value.value);
      this.isAddressAvailable = available;
      if (!available) {
        return {
          ...value,
          error: this.$t('address-input.error.target-offline') as string,
          isAddress: true,
        };
      }
      return value;
    } finally {
      this.busy = false;
    }
  }

  private async lookupEnsDomain(value: string): Promise<ValidationResult> {
    if (!AddressUtils.isDomain(value))
      return {
        error: this.$t('address-input.error.invalid-address') as string,
        value,
      };
    this.busy = true;
    try {
      const resolvedAddress = await this.$raiden.ensResolve(value);
      if (!resolvedAddress || !AddressUtils.checkAddressChecksum(resolvedAddress)) {
        return {
          error: this.$t('address-input.error.ens-resolve-failed') as string,
          value: resolvedAddress,
        };
      }
      const res = { value: resolvedAddress, originalValue: value };
      return res;
    } catch (e) {
      return {
        error: this.$t('address-input.error.ens-resolve-failed') as string,
        value,
      };
    } finally {
      this.busy = false;
    }
  }

  private validateAddress(value: string): ValidationResult {
    let message;
    if (!AddressUtils.checkAddressChecksum(value)) {
      message = this.$t('address-input.error.no-checksum', { ethsum: ETHSUM }) as string;
    } else if (this.exclude.includes(value)) {
      message = this.$t(this.excludeErrorMessage) as string;
    } else if (this.restricted.length > 0 && !this.restricted.includes(value)) {
      message = this.$t(this.restrictedErrorMessage) as string;
    }

    return { error: message, value, isAddress: true };
  }

  mounted() {
    if (this.isChecksumAddress(this.value)) {
      this.address = this.value;
      this.valueChanged(this.value);
    }
  }

  @Watch('presences')
  onPresenceUpdate() {
    if (!this.address || !this.value || this.presences[this.address] === this.isAddressAvailable) {
      return;
    }
    this.valueChanged(this.value);
  }

  @Watch('value')
  onChange(value: string) {
    if (value === this.address) return;
    if (value === '' || this.isChecksumAddress(value) || AddressUtils.isDomain(value)) {
      this.address = value;
      this.valueChanged(this.value);
    }
  }

  @Emit()
  public input(_value?: string) {
    /* pass */
  }

  valueChanged(value?: string) {
    this.errorMessages = [];
    this.typing = true;
    this.debouncedValueChanged(value);
  }

  debouncedValueChanged = debounce(async function (this: AddressInput, value?: string) {
    let result: ValidationResult;
    if (!value) {
      result = { error: '', value: '' };
    } else {
      this.touched = true;
      if (AddressUtils.isAddress(value)) result = this.validateAddress(value);
      else result = await this.lookupEnsDomain(value);
      result = await this.checkAvailability(result);
    }
    this.typing = false;

    if (result.error) {
      this.errorMessages.push(result.error);
    } else {
      this.address = result.value;
    }
    this.input(result.value);
    this.checkForErrors();
  }, 600);

  isChecksumAddress(address: string): boolean {
    const tokenAddress = address;
    return AddressUtils.isAddress(tokenAddress) && AddressUtils.checkAddressChecksum(tokenAddress);
  }

  private checkForErrors() {
    /* istanbul ignore if */
    if (!this.$refs.address) {
      return;
    }

    this.valid = this.errorMessages.length === 0;
    if (!this.valid) {
      return;
    }

    setTimeout(() => {
      this.$refs.address.validate();
    });
  }

  onDecode(decoded: string) {
    this.address = decoded;
    this.valueChanged(decoded);
    this.isQrCodeOverlayVisible = false;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/mixins';
@import '@/scss/colors';
@import '@/scss/fonts';

.address-input {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;

  &__blockie {
    border-radius: 50%;
    box-sizing: border-box;
    height: 22px;
    width: 22px;
    border: 1px solid #979797;
    background-color: $color-gray;
  }

  &__availability {
    margin-right: 10px;
    height: 26px;
    width: 26px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 100%;

    &--online {
      box-shadow: 0 0 0 2px greenyellow;
    }

    &--offline {
      box-shadow: 0 0 0 2px gray;
    }
  }

  ::v-deep {
    input {
      color: $color-white;
      caret-color: $color-white !important;
      font-family: $main-font;
      font-size: 16px;
      max-height: 49px;

      &:focus {
        outline: 0;
      }
    }

    .v-input {
      &__slot {
        border-radius: 10px;
        background-color: $input-background;
        padding: 8px 8px 8px 16px;
        border: 1.5px solid transparent;
        max-height: 49px;
      }

      &--is-focused {
        .v-input {
          &__slot {
            border: 1.5px solid $primary-color;
          }
        }
      }
    }

    .v-text-field {
      &__details {
        padding-top: 8px;
      }

      > .v-input {
        &__control {
          > .v-input {
            &__slot {
              &::before,
              &::after {
                border-width: 0 0 0 0;
              }
            }
          }
        }
      }
    }

    .v-messages {
      font-family: $main-font;
      font-size: 14px;
      line-height: 16px;
      text-align: left;
      border: 1px solid transparent;

      &__wrapper {
        color: $color-white;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding-left: 20px;
        justify-content: center;

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

  &--invalid {
    ::v-deep {
      .v-messages {
        border: none !important;

        &:after {
          content: ' ';
          position: absolute;
          left: 50%;
          bottom: 90%;
          display: inline-block;
          padding: 3px;
        }
      }
    }
  }

  &--hint-visible {
    ::v-deep {
      .v-text-field {
        &__details {
          padding-top: 0;
          margin-top: 0;
        }
      }
    }
  }

  &--untouched {
    caret-color: white !important;
    color: white !important;
  }

  &__qr-code {
    width: 20px;
    margin: 1px 6px 0 0;
    cursor: pointer;

    svg {
      width: 100%;
    }

    &:hover {
      ::v-deep {
        g,
        path,
        rect {
          fill: $primary-color !important;
        }
      }
    }
  }
}

$dark_border: #323232;
$dark_background: #323232;
</style>
