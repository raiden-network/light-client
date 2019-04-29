<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <fieldset>
    <v-combobox
      :filter="filter"
      :hide-no-data="!search"
      :item-text="item => item.address || ''"
      :item-value="item => item.address || ''"
      :items="filteredTokens"
      :label="label"
      :rules="rules"
      :search-input.sync="search"
      :value="value"
      :error-messages="errorMessages"
      @change="valueChanged($event)"
      clearable
      hide-selected
      ref="address"
      id="address-input"
    >
      <template v-slot:prepend-inner>
        <img
          :src="blockie(value)"
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
import DataFilters from '@/utils/data-filters';
import { ValidationRule } from '@/types';

@Component({})
export default class AddressInput extends Mixins(BlockieMixin) {
  private timeout: number = 0;
  private readonly baseRules: ValidationRule[] = [
    (v: string) => !!v || 'The address cannot be empty',
    (v: string) => (v && this.isAddress(v)) || 'A valid address is required',
    (v: string) =>
      (v && this.isChecksumAddress(v)) ||
      `Address ${v} is not in checksum format`
  ];

  private readonly tokenModeRules: ValidationRule[] = [
    (v: string) =>
      (v && this.tokens.findIndex(value1 => value1.address === v) > -1) ||
      `This address does not belong to one of the available tokens`
  ];

  @Prop({})
  disabled!: boolean;
  @Prop({ required: true })
  value!: string;
  @Prop({ required: false, default: () => [] })
  tokens!: Token[];
  @Prop({ required: false, default: false })
  ens!: boolean;
  @Prop({ required: false, default: true })
  tokenMode!: boolean;

  label: string = '';
  search: string = '';
  errorMessages: string[] = [];

  get rules(): ValidationRule[] {
    if (this.tokenMode) {
      return _.concat(this.baseRules, this.tokenModeRules);
    } else {
      return this.baseRules;
    }
  }

  get filteredTokens(): Token[] {
    if (!this.search) {
      return this.tokens;
    } else {
      return this.tokens.filter(value1 => this.filter(value1, this.search));
    }
  }

  // noinspection JSUnusedLocalSymbols
  @Emit()
  public input(value?: string) {}

  isAddress(address: string | Token): boolean {
    return AddressUtils.isAddress(this.extractAddress(address));
  }

  // noinspection JSMethodCanBeStatic
  extractAddress(address: string | Token) {
    let tokenAddress: string;

    if (_.isObject(address)) {
      tokenAddress = address.address;
    } else {
      tokenAddress = address as string;
    }
    return tokenAddress;
  }

  isChecksumAddress(address: string | Token): boolean {
    const tokenAddress = this.extractAddress(address);
    return (
      AddressUtils.isAddress(tokenAddress) &&
      AddressUtils.checkAddressChecksum(tokenAddress)
    );
  }

  // noinspection JSMethodCanBeStatic
  filter(item: Token, queryText: string): boolean {
    return DataFilters.filterToken(item, queryText);
  }

  valueChanged(model?: string | Token) {
    this.errorMessages = [];
    let address: string | undefined = undefined;
    if (typeof model === 'string') {
      address = model;
      this.resolveEnsAddress(address);
    } else if (model && typeof model === 'object') {
      address = model.address;
      this.search = model.address;
    }
    this.label = '';
    this.input(address);
  }

  private resolveEnsAddress(address: string) {
    if (
      this.ens &&
      !AddressUtils.isAddressLike(address) &&
      AddressUtils.isDomain(address)
    ) {
      const parent = this;
      if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = 0;
      }

      this.timeout = setTimeout(() => {
        this.$raiden
          .ensResolve(address)
          .then(resolvedAddress => {
            if (resolvedAddress) {
              parent.label = address as string;
              parent.search = resolvedAddress;
              parent.input(resolvedAddress);
              this.errorMessages = [];
            } else {
              this.errorMessages.push(
                `Could not resolve an address for ${address}`
              );
            }
            this.timeout = 0;
          })
          .catch(e => {
            console.log(e);
            this.timeout = 0;
          });
      }, 800);
    }
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
