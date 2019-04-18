<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <fieldset>
    <v-combobox
      id="address-input"
      :clearable="true"
      :filter="filter"
      :hide-no-data="!search"
      :items="tokens"
      :label="label"
      :rules="rules"
      :search-input.sync="search"
      :value="value"
      :item-text="item => item.address"
      @input="valueChanged($event)"
    >
      <template v-slot:prepend-inner>
        <img
          class="selection-blockie"
          v-if="address"
          :src="blockie(address)"
          alt="Selected token address blockie"
        />
        <v-icon v-else>cancel</v-icon>
      </template>
      <template v-slot:item="{ index, item }">
        <v-list-tile-avatar>
          <img :src="blockie(item.address)" alt="Token address blockie" />
        </v-list-tile-avatar>
        <v-list-tile-content>
          <div>
            <span class="font-weight-medium">
              {{ item.symbol }}
            </span>
            · {{ item.name }}
          </div>
          <v-spacer></v-spacer>
          <v-list-tile-sub-title class="caption font-weight-light">
            {{ item.address }}
          </v-list-tile-sub-title>
        </v-list-tile-content>
      </template>
    </v-combobox>
  </fieldset>
</template>

<script lang="ts">
import AddressUtils from '@/utils/address-utils';
import { Component, Emit, Mixins, Prop } from 'vue-property-decorator';
import { Token } from '@/model/types';
import BlockieMixin from '@/mixins/blockie-mixin';
import _ from 'lodash';

@Component({})
export default class AddressInput extends Mixins(BlockieMixin) {
  label: string = '';
  @Prop({})
  disabled!: boolean;
  @Prop({ required: true })
  value!: string;
  @Prop({ required: false, default: [] })
  tokens!: Token[];

  address: string = '';
  search: string = '';

  private static isAddress(address: string | Token): boolean {
    return AddressUtils.isAddress(this.extractAddress(address));
  }

  private static extractAddress(address: string | Token) {
    let tokenAddress: string;

    if (_.isObject(address)) {
      tokenAddress = address.address;
    } else {
      tokenAddress = address as string;
    }
    return tokenAddress;
  }

  private static isChecksumAddress(address: string | Token): boolean {
    const tokenAddress = this.extractAddress(address);
    return (
      AddressUtils.isAddress(tokenAddress) &&
      AddressUtils.checkAddressChecksum(tokenAddress)
    );
  }

  readonly rules = [
    (v: string) => !!v || 'The address cannot be empty',
    (v: string) =>
      (v && AddressInput.isAddress(v)) || 'A valid address is required',
    (v: string) =>
      (v && AddressInput.isChecksumAddress(v)) ||
      `Address ${v} is not in checksum format`
  ];

  filter(item: Token, queryText: string) {
    return (
      _.startsWith(item.symbol, queryText) ||
      item.address.indexOf(queryText) > -1 ||
      (item.name && item.name.indexOf(queryText) > -1)
    );
  }

  @Emit()
  public input(value: string) {}

  valueChanged(value?: string | Token) {
    let actualValue: string = '';
    if (typeof value === 'string') {
      actualValue = value;
    } else if (typeof value === 'object' && value !== null) {
      actualValue = value.address;
    }
    this.input(actualValue);
    this.address = actualValue;
  }
}
</script>

<style lang="scss" scoped>
.selection-blockie {
  border-radius: 50%;
  box-sizing: border-box;
  height: 28px;
  width: 28px;
  border: 1px solid #979797;
  background-color: #d8d8d8;
}
</style>
