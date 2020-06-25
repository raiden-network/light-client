<template>
  <raiden-dialog class="channel-deposit" :visible="visible" @close="cancel">
    <v-card-title>
      <v-row align="center" justify="center">
        <v-col>
          <span v-if="loading">
            {{ $t('transfer.steps.deposit.title') }}
          </span>
          <span v-else-if="done">
            {{ $t('transfer.steps.deposit-done.title') }}
          </span>
          <span v-else>
            {{ $t('transfer.steps.deposit.label') }}
          </span>
        </v-col>
      </v-row>
    </v-card-title>

    <v-card-actions>
      <v-row v-if="loading" align="center" justify="center">
        <v-col cols="6">
          <v-progress-linear color="primary" indeterminate />
        </v-col>
      </v-row>
      <v-row v-else-if="done" align="center" justify="center">
        <v-col cols="6">
          <v-img
            class="channel-deposit__done"
            :src="require('@/assets/done.svg')"
          ></v-img>
        </v-col>
      </v-row>
      <v-row v-else align="center" justify="center">
        <v-col>
          <v-form v-model="valid" @submit.prevent="depositTokens()">
            <amount-input
              v-model="deposit"
              :token="token"
              :max="token.balance"
              limit
            />
            <div class="channel-deposit__button">
              <action-button
                :id="`confirm-${identifier}`"
                :enabled="valid"
                :text="$t('channel-deposit.buttons.confirm')"
                full-width
              />
            </div>
          </v-form>
        </v-col>
      </v-row>
    </v-card-actions>

    <v-card-text>
      <v-row align="center" justify="center">
        <span v-if="loading">
          {{ $t('transfer.steps.deposit.description') }}
        </span>
        <span v-else-if="done">
          {{ $t('transfer.steps.deposit-done.description') }}
        </span>
      </v-row>
    </v-card-text>
  </raiden-dialog>
</template>

<script lang="ts">
import { Component, Emit, Prop, Vue, Watch } from 'vue-property-decorator';
import { Token } from '@/model/types';
import AmountInput from '@/components/AmountInput.vue';
import ActionButton from '@/components/ActionButton.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: {
    AmountInput,
    ActionButton,
    RaidenDialog
  }
})
export default class ChannelDepositDialog extends Vue {
  @Prop({ required: true })
  identifier!: number;
  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;
  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  loading!: boolean;
  @Prop({ required: false, default: false })
  done?: boolean;

  deposit: string = '';
  valid: boolean = false;

  @Watch('visible')
  onVisibilityChanged(visible: boolean) {
    if (!visible) {
      return;
    }
    this.updateDeposit();
  }

  mounted() {
    this.updateDeposit();
  }

  private updateDeposit() {
    this.deposit = (this.token.decimals ?? 18) === 0 ? '0' : '0.0';
  }

  @Emit()
  cancel() {}

  depositTokens() {
    const deposit = BalanceUtils.parse(this.deposit, this.token.decimals!);
    if (!deposit.isZero()) {
      this.$emit('depositTokens', deposit);
    }
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.channel-deposit {
  &__button {
    margin-top: 45px;
  }

  &__done {
    height: 110px;
    margin: 0 auto;
    width: 110px;
  }
}
</style>
