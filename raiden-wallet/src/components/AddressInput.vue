<template>
  <div>
    <v-label v-if="label">{{ label }}</v-label>
    <v-text-field
      v-model="value"
      :rules="rules"
      :disabled="disabled"
    ></v-text-field>
  </div>
</template>

<script lang="ts">
import Web3Utils from '@/utils/web3-utils';
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class AddressInput extends Vue {
  @Prop({ required: false })
  label: string = '';
  @Prop({})
  disabled: boolean = false;
  @Prop({ required: true })
  value: string = '';

  readonly rules = [
    (v: string) => !!v || 'The address cannot be empty',
    (v: string) =>
      (v && Web3Utils.isAddress(v)) || 'A valid address is required',
    (v: string) =>
      (v && Web3Utils.checkAddressChecksum(v)) ||
      `Address ${v} is not in checksum format`
  ];
}
</script>

<style scoped></style>
