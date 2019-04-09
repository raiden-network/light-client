<template>
  <v-layout row justify-center>
    <v-dialog v-model="display" persistent max-width="450">
      <v-card>
        <v-card-title class="headline">Deposit</v-card-title>
        <v-card-text>
          <amount-input
            :token="token"
            label="Amount"
            limit
            v-model="deposit"
          ></amount-input>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="primary darken-1" flat @click="cancel()">
            Cancel
          </v-btn>
          <v-btn color="primary darken-1" flat @click="confirm()">
            Confirm
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-layout>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import AmountInput from '@/components/AmountInput.vue';
import { Token } from '@/model/types';

@Component({
  components: { AmountInput }
})
export default class DepositDialog extends Vue {
  @Prop({ required: true })
  display!: boolean;
  @Prop({ required: true })
  token!: Token;

  deposit: string = '0.0';

  confirm() {
    this.$emit('confirm', this.deposit);
  }

  cancel() {
    this.$emit('cancel');
  }
}
</script>

<style lang="scss" scoped></style>
