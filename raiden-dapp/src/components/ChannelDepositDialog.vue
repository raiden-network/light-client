<template>
  <raiden-dialog :visible="visible" class="channel-deposit" @close="cancel">
    <v-card-text>
      <v-col>
        <v-form v-model="valid">
          <amount-input
            v-model="deposit"
            :token="token"
            :label="$t('channel-deposit.input.label')"
            :max="token.balance"
            limit
          ></amount-input>
        </v-form>
      </v-col>
    </v-card-text>
    <v-card-actions>
      <action-button
        sticky
        arrow
        :enabled="valid"
        :text="$t('channel-deposit.buttons.confirm')"
        @click="mintDeposit()"
      >
      </action-button>
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { Token } from '@/model/types';
import AmountInput from '@/components/AmountInput.vue';
import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/RaidenDialog.vue';
import BlurredOverlay from '@/components/BlurredOverlay.vue';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: {
    AmountInput,
    ActionButton,
    RaidenDialog,
    BlurredOverlay
  }
})
export default class ChannelDepositDialog extends Vue {
  @Prop({ required: true })
  identifier!: number;

  @Prop({ required: true })
  visible!: boolean;

  @Prop({ required: true })
  token!: Token;

  deposit: string = '0.0';
  valid: boolean = false;

  @Emit()
  cancel() {}

  confirm() {
    const deposit = BalanceUtils.parse(this.deposit, this.token.decimals!);
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
}
</style>
