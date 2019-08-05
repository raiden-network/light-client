<template>
  <fieldset class="address-input">
    <v-text-field
      id="address-input"
      ref="address"
      :hint="hint"
      :value="address"
      :error-messages="errorMessages"
      :class="{
        'address-input--invalid': !valid && touched,
        'address-input--hint-visible': hint.length > 0,
        'address-input--untouched': !touched
      }"
      :placeholder="$t('address-input.input.placeholder')"
      @blur="$emit('blur')"
      @focus="$emit('focus')"
      @input="updateValue"
      @change="updateValue"
      persistent-hint
      clearable
      hide-selected
    >
      <template #append>
        <div class="address-input__status-icon">
          <v-img
            v-if="!valid && touched"
            :src="require('../assets/input_invalid.svg')"
            class="address-input__status-icon__icon"
          >
          </v-img>
          <v-img
            v-if="valid"
            :src="require('../assets/input_valid.svg')"
            class="address-input__status-icon__icon"
          ></v-img>
        </div>
      </template>
      <template #prepend-inner>
        <img
          v-if="value && isChecksumAddress(value)"
          :src="$blockie(value)"
          :alt="$t('address-input.blockie-alt')"
          class="address-input__blockie"
        />
        <div v-else-if="timeout">
          <v-progress-circular
            class="prepend"
            indeterminate
            color="primary"
          ></v-progress-circular>
        </div>
        <div v-else></div>
      </template>
    </v-text-field>
  </fieldset>
</template>

<script lang="ts">
import AddressUtils from '@/utils/address-utils';
import { Component, Emit, Mixins, Prop } from 'vue-property-decorator';
import BlockieMixin from '@/mixins/blockie-mixin';

@Component({})
export default class AddressInput extends Mixins(BlockieMixin) {
  private timeout: number = 0;

  @Prop({})
  disabled!: boolean;
  @Prop({ required: true })
  value!: string;

  address: string = '';

  valid: boolean = false;
  touched: boolean = false;
  hint: string = '';
  errorMessages: string[] = [''];

  // noinspection JSUnusedLocalSymbols
  @Emit()
  public input(value?: string) {}

  // noinspection JSMethodCanBeStatic
  isChecksumAddress(address: string): boolean {
    const tokenAddress = address;
    return (
      AddressUtils.isAddress(tokenAddress) &&
      AddressUtils.checkAddressChecksum(tokenAddress)
    );
  }

  updateValue(value?: string) {
    this.errorMessages = [];
    this.hint = '';
    this.updateErrors(value);
    this.checkForErrors();
  }

  private updateErrors(value?: string) {
    if (!value) {
      this.input(value);
      this.errorMessages.push(this.$t('address-input.error.empty') as string);
    } else if (
      AddressUtils.isAddress(value) &&
      !AddressUtils.checkAddressChecksum(value)
    ) {
      this.errorMessages.push(this.$t(
        'address-input.error.no-checksum'
      ) as string);
    } else if (AddressUtils.checkAddressChecksum(value)) {
      this.input(value);
    } else if (
      !AddressUtils.isAddressLike(value) &&
      AddressUtils.isDomain(value)
    ) {
      this.resolveEnsAddress(value);
    } else {
      this.errorMessages.push(this.$t(
        'address-input.error.invalid-address'
      ) as string);
    }
  }

  private checkForErrors() {
    if (this.$refs.address) {
      this.touched = true;
      this.valid = this.errorMessages.length === 0;
    }
  }

  private resolveEnsAddress(url: string) {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = 0;
    }

    this.timeout = (setTimeout(() => {
      this.$raiden
        .ensResolve(url)
        .then(resolvedAddress => {
          if (resolvedAddress) {
            this.hint = resolvedAddress;
            this.input(resolvedAddress);
            this.errorMessages = [];
          } else {
            this.errorMessages.push(this.$t(
              'address-input.error.ens-resolve-failed',
              {
                url: url
              }
            ) as string);
            this.input(undefined);
            this.checkForErrors();
          }
          this.timeout = 0;
        })
        .catch(() => {
          this.errorMessages.push(this.$t(
            'address-input.error.ens-resolve-failed',
            {
              url: url
            }
          ) as string);
          this.input(undefined);
          this.checkForErrors();
          this.timeout = 0;
        });
    }, 800) as unknown) as number;
  }
}
</script>

<style lang="scss" scoped>
@import '../main';
@import '../scss/colors';

.address-input__blockie {
  border-radius: 50%;
  box-sizing: border-box;
  height: 28px;
  width: 28px;
  border: 1px solid #979797;
  background-color: #d8d8d8;
  margin-right: 12px;
}

.address-input {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;

  @include respond-to(handhelds) {
    padding-top: 30px;
    padding-bottom: 30px;
    border: 0;
  }
}

.address-input ::v-deep .v-text-field__details {
  padding-top: 8px;
}

.address-input ::v-deep input {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 30px;
  font-weight: 500;
  line-height: 38px;
  max-height: 40px;
}

.address-input ::v-deep input:focus {
  outline: 0;
}

.address-input ::v-deep .v-messages {
  color: #323232 !important;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
  .v-messages__wrapper {
    color: white;
  }
}

.address-input ::v-deep .v-messages {
  border: 1px solid transparent;
  font-family: Roboto, sans-serif;
  font-size: 13px;
  line-height: 18px;
  text-align: center;
  margin-top: 10px;

  .v-messages__wrapper {
    height: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
}

$dark_border: #323232;
$dark_background: #323232;

.address-input--invalid ::v-deep .v-messages {
  border-color: $dark_border;
  background-color: $dark_background;
  border: 1px solid !important;
  border-radius: 5px;
}

.address-input--invalid ::v-deep .v-messages:after {
  content: ' ';
  border: solid;
  border-radius: 1px;
  border-width: 0 1px 1px 0;
  position: absolute;
  left: 50%;
  bottom: 90%;
  display: inline-block;
  padding: 3px;
  transform: rotate(-135deg);
  -webkit-transform: rotate(-135deg);
  border-color: $dark_border;
  background-color: $dark_background;
}

.address-input--hint-visible ::v-deep .v-messages {
  color: #696969 !important;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 19px;
  margin-top: 4px;
  margin-bottom: 14px;
}

.address-input--hint-visible ::v-deep .v-text-field__details {
  padding-top: 0;
  margin-top: 0;
}

.address-input__status-icon__icon {
  line-height: 20px;
  width: 20px;
}

.address-input__status-icon {
  padding: 8px;
}

.address-input--untouched {
  caret-color: white !important;
  color: white !important;
}

::v-deep .v-input__icon--clear {
  margin-top: 6px;
}

::v-deep .v-text-field > .v-input__control > .v-input__slot::before {
  border-width: 2px 0 0 0;
}

::v-deep .v-text-field > .v-input__control > .v-input__slot::after {
  border-width: 3px 0 0 0;
}
</style>
