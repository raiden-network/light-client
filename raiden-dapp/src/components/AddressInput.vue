<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <fieldset>
    <v-text-field
      id="address-input"
      ref="address"
      :hint="hint"
      :value="internalValue"
      :error-messages="errorMessages"
      :class="{ invalid: !valid, 'hint-visible': hint.length > 0 }"
      persistent-hint
      placeholder="Enter an address or ens name..."
      clearable
      hide-selected
      @blur="checkValidity()"
      @input="valueChanged($event)"
    >
      <template v-slot:append>
        <div class="status-icon-wrapper">
          <v-icon v-if="!valid" class="status-icon" large>error</v-icon>
        </div>
      </template>
      <template v-slot:prepend-inner>
        <img
          v-if="value && isChecksumAddress(value)"
          :src="$blockie(value)"
          alt="Selected token address blockie"
          class="selection-blockie prepend"
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

  internalValue?: string;
  valid: boolean = true;
  hint: string = '';
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
    this.hint = '';

    if (!value) {
      this.input(value);
      this.errorMessages.push('The address cannot be empty');
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

    this.checkValidity();
  }

  private checkValidity() {
    if (this.$refs.address) {
      this.valid = this.errorMessages.length === 0;
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
            this.hint = resolvedAddress;
            this.input(resolvedAddress);
            this.errorMessages = [];
          } else {
            this.errorMessages.push(`Could not resolve an address for ${url}`);
            this.input(undefined);
            this.checkValidity();
          }
          this.timeout = 0;
        })
        .catch(e => {
          console.log(e);
          this.errorMessages.push(`Could not resolve an address for ${url}`);
          this.input(undefined);
          this.checkValidity();
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

.prepend {
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

.address-input /deep/ .v-text-field__details {
  padding-top: 8px;
}

.address-input /deep/ input {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 30px;
  font-weight: 500;
  line-height: 38px;
  max-height: 40px;
}
.address-input /deep/ input:focus {
  outline: 0;
}

.address-input /deep/ .v-messages {
  color: white !important;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.address-input /deep/ .v-messages {
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

$dark_border: #fbfbfb;
$dark_background: #1e1e1e;

.invalid /deep/ .v-messages {
  border-color: $dark_border;
  background-color: $dark_background;
  border: 1px solid !important;
  border-radius: 5px;
}

.invalid /deep/ .v-messages:after {
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

.hint-visible /deep/ .v-messages {
  color: #696969 !important;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 19px;
  margin-top: 4px;
  margin-bottom: 14px;
}

.hint-visible /deep/ .v-text-field__details {
  padding-top: 0;
  margin-top: 0;
}

.status-icon-wrapper {
  margin-left: 12px;
}

.status-icon {
  color: #323232;
  background: white;
  border-radius: 50%;
  line-height: 18px;
  width: 19px;
}
</style>
