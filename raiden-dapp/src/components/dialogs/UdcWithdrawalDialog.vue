<template>
  <raiden-dialog
    :visible="visible"
    data-cy="udc-withdrawal-dialog"
    class="udc-withdrawal-dialog"
    @close="cancel"
  >
    <v-card-title>{{ $t('udc.withdrawal') }}</v-card-title>

    <v-card-text>
      <spinner v-if="inProgress" class="udc-withdrawal-dialog__progress" />
      <error-message v-else-if="error" :error="error" />

      <template v-else-if="isDone">
        <v-img class="udc-withdrawal-dialog__done my-4" :src="require('@/assets/done.svg')" />
        <span>{{ $t('udc.withdrawal-planned') }}</span>
      </template>

      <template v-else>
        <amount-input
          v-model="amount"
          class="udc-withdrawal-dialog__amount"
          data-cy="udc-withdrawal-dialog__amount"
          :token="tokenWithAsteriskAtSymbol"
          :placeholder="$t('transfer.amount-placeholder')"
          autofocus
        />

        <div
          class="udc-withdrawal-dialog__available-eth"
          :class="{ 'udc-withdrawal-dialog__available-eth--too-low': accountBalanceTooLow }"
        >
          {{
            $t('udc-deposit-dialog.available-eth', {
              balance: accountBalance,
              currency: $t('app-header.currency'),
            }) | upperCase
          }}
        </div>
      </template>
    </v-card-text>

    <v-card-actions v-if="!error && !isDone" class="flex-column">
      <action-button
        data-cy="udc-withdrawal-dialog__button"
        class="udc-withdrawal-dialog__button"
        :enabled="isValid && !accountBalanceTooLow"
        :text="$t('general.buttons.confirm')"
        full-width
        @click="planWithdraw"
      />

      <span v-if="!error" class="mt-2">
        <sup>{{ $t('udc.asterisk') }}</sup>
        {{ $t('udc.withdrawal-footnote') }}
      </span>
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import type { BigNumber } from 'ethers';
import { constants, utils } from 'ethers';
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import AmountInput from '@/components/AmountInput.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import Spinner from '@/components/icons/Spinner.vue';
import type { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: {
    ErrorMessage,
    RaidenDialog,
    AmountInput,
    ActionButton,
    Spinner,
  },
  computed: {
    ...mapState('userDepositContract', { udcToken: 'token' }),
  },
})
export default class UdcWithdrawalDialog extends Vue {
  amount = '0';
  inProgress = false;
  error: Error | null = null;
  isDone = false;

  @Prop({ required: true, type: Boolean })
  visible!: boolean;
  @Prop({ required: true, type: String })
  accountBalance!: string;
  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  capacity!: BigNumber;

  private done() {
    this.isDone = true;
    setTimeout(() => {
      this.isDone = false;
      this.cancel();
    }, 5000);
  }

  get accountBalanceTooLow(): boolean {
    return BalanceUtils.parse(this.accountBalance, 18).lte(constants.Zero);
  }

  get tokenWithAsteriskAtSymbol(): Token {
    return { ...this.token, symbol: this.token.symbol + '*' };
  }

  get withdrawAmount(): BigNumber {
    let amount: BigNumber;
    try {
      amount = utils.parseUnits(this.amount, this.token.decimals);
    } catch (e) {
      amount = constants.Zero;
    }
    return amount;
  }

  get isValid(): boolean {
    if (this.inProgress) {
      return false;
    }
    const amount = this.withdrawAmount;
    return amount.gt(constants.Zero) && amount.lte(this.capacity);
  }

  async planWithdraw() {
    this.inProgress = true;
    try {
      await this.$raiden.planUDCWithdraw(this.withdrawAmount);
      this.done();
    } catch (e) {
      this.error = e;
    } finally {
      this.inProgress = false;
    }
  }

  @Emit()
  cancel() {
    this.isDone = false;
    this.inProgress = false;
    this.error = null;
    this.amount = '0';
  }
}
</script>

<style scoped lang="scss">
.udc-withdrawal-dialog {
  &__done {
    width: 110px;
    height: 110px;
    margin: 0 auto;
  }

  &__available-eth {
    border-radius: 8px;
    color: #84878a;
    background-color: #262829;
    padding: 4px 8px;
    margin-top: 16px;
    font-size: 12px;
    line-height: 18px;

    &--too-low {
      color: #ff0000;
      background-color: #420d0d;
    }
  }
}
</style>
