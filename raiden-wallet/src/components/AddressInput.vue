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
import AddressUtils from '@/utils/address-utils';
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component({})
export default class AddressInput extends Vue {
  @Prop({ required: false })
  label!: string;
  @Prop({})
  disabled!: boolean;
  @Prop({ required: true })
  value!: number;

  readonly rules = [
    (v: string) => !!v || 'The address cannot be empty',
    (v: string) =>
      (v && AddressUtils.isAddress(v)) || 'A valid address is required',
    (v: string) =>
      (v && AddressUtils.checkAddressChecksum(v)) ||
      `Address ${v} is not in checksum format`
  ];
}
</script>

<style scoped></style>
