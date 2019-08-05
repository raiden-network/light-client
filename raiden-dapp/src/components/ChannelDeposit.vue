<template>
  <v-layout column class="channel-deposit">
    <v-layout class="channel-deposit__wrapper" align-center justify-center>
      <v-flex xs12>
        <v-form v-model="valid">
          <amount-input
            v-model="deposit"
            :token="token"
            :label="$t('channel-deposit.input.label')"
            limit
          ></amount-input>
        </v-form>
      </v-flex>
    </v-layout>
    <v-layout align-end justify-center class="channel-deposit__buttons">
      <v-btn
        :id="`cancel-${identifier}`"
        @click="cancel()"
        light
        class="text-capitalize channel-deposit__buttons__cancel"
      >
        {{ $t('channel-deposit.buttons.cancel') }}
      </v-btn>
      <v-btn
        :id="`confirm-${identifier}`"
        :disabled="!valid"
        @click="confirm()"
        light
        class="text-capitalize channel-deposit__buttons__confirm"
      >
        {{ $t('channel-deposit.buttons.confirm') }}
      </v-btn>
    </v-layout>
  </v-layout>
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
@import '../scss/colors';
.channel-deposit {
  height: 252px;
  padding: 20px;
  background-color: $dialog-background;
  box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
}

.channel-deposit__wrapper > * {
  height: 150px;
  font-size: 16px;
  line-height: 21px;
  text-align: center;
}

.channel-deposit__buttons {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.channel-deposit__buttons button {
  height: 35px;
  width: 135px;
  color: white;
  border-radius: 29px;
  margin-left: 15px;
  margin-right: 15px;
}

.channel-deposit__buttons__cancel {
  background-color: transparent !important;
  border: 2px solid $primary-color;
}

.channel-deposit__buttons__confirm {
  background-color: $primary-color !important;
  color: #ffffff;
}

.theme--light.v-btn.v-btn--disabled:not(.v-btn--icon):not(.v-btn--text):not(.v-btn--outline) {
  background-color: $primary-disabled-color !important;
  color: #c4c4c4 !important;
}
</style>
