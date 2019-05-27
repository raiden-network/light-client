<template>
  <div class="body">
    <v-layout class="description-wrapper" row align-center justify-center>
      <v-flex class="description">
        <v-form v-model="valid">
          <amount-input
            v-model="deposit"
            light
            :token="token"
            label="Amount"
            limit
          ></amount-input>
        </v-form>
      </v-flex>
    </v-layout>
    <v-layout row align-end justify-center class="action-buttons">
      <v-btn
        :id="`cancel-${identifier}`"
        light
        class="text-capitalize cancel-button"
        @click="cancel()"
      >
        Cancel
      </v-btn>
      <v-btn
        :id="`confirm-${identifier}`"
        light
        class="text-capitalize confirm-button"
        :disabled="!valid"
        @click="confirm()"
      >
        Confirm
      </v-btn>
    </v-layout>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { Token } from '@/model/types';
import AmountInput from '@/components/AmountInput.vue';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: {
    AmountInput
  }
})
export default class ChannelDeposit extends Vue {
  @Prop({ required: true })
  identifier!: number;

  @Prop({ required: true })
  token!: Token;

  deposit: string = '0.0';
  valid: boolean = false;

  @Emit()
  cancel() {}

  confirm() {
    const deposit = BalanceUtils.parse(this.deposit, this.token.decimals);
    if (deposit.isZero()) {
      this.$emit('cancel');
    } else {
      this.$emit('confirm', deposit);
    }
  }
}
</script>

<style scoped lang="scss">
.body {
  height: 250px;
  padding: 25px;
  background-color: #e4e4e4;
  box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
}

.description-wrapper > * {
  height: 150px;
  color: #050505 !important;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.description {
  margin-top: 10px;
}

.action-buttons {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.action-buttons button {
  height: 40px;
  width: 125px;
  border: 2px solid #050505;
  border-radius: 29px;
  margin-left: 20px;
  margin-right: 20px;
}

.cancel-button {
  background-color: transparent !important;
  color: #050505;
}

.confirm-button {
  background-color: #000000 !important;
  color: #ffffff;
}

.theme--light.v-btn.v-btn--disabled:not(.v-btn--icon):not(.v-btn--flat):not(.v-btn--outline) {
  background-color: #2b2b2b !important;
  color: #c4c4c4 !important;
}
</style>
