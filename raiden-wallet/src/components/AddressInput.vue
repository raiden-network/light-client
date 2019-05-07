<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <fieldset>
    <v-text-field
      :label="label"
      :rules="rules"
      :value="internalValue"
      :error-messages="errorMessages"
      @input="valueChanged($event)"
      clearable
      hide-selected
      ref="address"
      id="address-input"
    >
      <template v-slot:prepend-inner>
        <img
          :src="$blockie(value)"
          alt="Selected token address blockie"
          class="selection-blockie"
          v-if="value && isChecksumAddress(value)"
        />
        <div v-else-if="timeout">
          <v-progress-circular
            indeterminate
            color="primary"
          ></v-progress-circular>
        </div>
        <div v-else>
          <v-icon>cancel</v-icon>
        </div>
      </template>
    </v-text-field>
  </fieldset>
</template>

<script lang="ts">
import AddressUtils from '@/utils/address-utils';
import { Component, Emit, Mixins, Prop } from 'vue-property-decorator';
import BlockieMixin from '@/mixins/blockie-mixin';
import { ValidationRule } from '@/types';

@Component({})
export default class AddressInput extends Mixins(BlockieMixin) {
  private timeout: number = 0;
  readonly rules: ValidationRule[] = [
    (v: string) => !!v || 'The address cannot be empty'
  ];

  @Prop({})
  disabled!: boolean;
  @Prop({ required: true })
  value!: string;

  internalValue?: string;
  label: string = '';
  errorMessages: string[] = [];

  created() {
    this.internalValue = this.value;
  }

  // noinspection JSUnusedLocalSymbols
  @Emit()
  public input(value?: string) {}

  isChecksumAddress(address: string): boolean {
    const tokenAddress = address;
    return (
      AddressUtils.isAddress(tokenAddress) &&
      AddressUtils.checkAddressChecksum(tokenAddress)
    );
  }

  valueChanged(value?: string) {
    this.errorMessages = [];
    this.label = '';

    if (!value) {
      this.input(value);
    } else if (
      AddressUtils.isAddress(value) &&
      !AddressUtils.checkAddressChecksum(value)
    ) {
      this.errorMessages.push(`The address is not in checksum format`);
    } else if (AddressUtils.checkAddressChecksum(value)) {
      this.input(value);
    } else if (
      !AddressUtils.isAddressLike(value) &&
      AddressUtils.isDomain(value)
    ) {
      this.resolveEnsAddress(value);
    } else {
      this.errorMessages.push(
        `The input doesn't seem like a valid address or ens name`
      );
    }
  }

  private resolveEnsAddress(url: string) {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = 0;
    }

    this.timeout = setTimeout(() => {
      this.$raiden
        .ensResolve(url)
        .then(resolvedAddress => {
          if (resolvedAddress) {
            this.label = resolvedAddress;
            this.input(resolvedAddress);
            this.errorMessages = [];
          } else {
            this.errorMessages.push(`Could not resolve an address for ${url}`);
            this.input(undefined);
          }
          this.timeout = 0;
        })
        .catch(e => {
          console.log(e);
          this.errorMessages.push(`Could not resolve an address for ${url}`);
          this.input(undefined);
          this.timeout = 0;
        });
    }, 800);
  }
}
</script>

<style lang="scss" scoped>
@import '../main';

.selection-blockie {
  border-radius: 50%;
  box-sizing: border-box;
  height: 28px;
  width: 28px;
  border: 1px solid #979797;
  background-color: #d8d8d8;
}

.address-input {
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

.address-input /deep/ input {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 30px;
  font-weight: 500;
  line-height: 38px;
  text-align: center;
  max-height: 40px;
  padding-left: 6px;
  padding-right: 6px;
}
.address-input /deep/ input:focus {
  outline: 0;
}

.address-input /deep/ .v-text-field__details {
  height: 36px;
  padding-top: 4px;
}

.address-input /deep/ .v-messages {
  color: white !important;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}
</style>
