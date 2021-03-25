<template>
  <raiden-dialog
    :visible="visible"
    data-cy="udc-withdrawal-dialog"
    class="udc-withdrawal-dialog"
    @close="cancel"
  >
    <v-card-title>{{ $t('udc.withdrawal') }}</v-card-title>
    <v-card-text>
      <v-row align="center" justify="center" no-gutters>
        <v-col v-if="error">
          <v-row>
            <error-message :error="error" />
          </v-row>
        </v-col>
        <v-col v-else-if="isDone" cols="12">
          <v-row align="center" justify="center">
            <v-col cols="6">
              <v-img class="udc-withdrawal-dialog__done" :src="require('@/assets/done.svg')" />
            </v-col>
          </v-row>
          <v-row align="center" justify="center">
            <v-col cols="10"> {{ $t('udc.withdrawal-planned') }}</v-col>
          </v-row>
        </v-col>
        <v-col v-else-if="inProgress">
          <spinner class="udc-withdrawal-dialog__progress" />
        </v-col>
        <v-col v-else cols="12">
          <v-row no-gutters justify="center">
            <v-col cols="10">
              <amount-input
                v-model="amount"
                class="udc-withdrawal-dialog__amount"
                data-cy="udc-withdrawal-dialog__amount"
                :token="tokenWithAsteriskAtSymbol"
                :placeholder="$t('transfer.amount-placeholder')"
                autofocus
              />
            </v-col>
          </v-row>
          <v-row no-gutters>
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
          </v-row>
        </v-col>
      </v-row>
    </v-card-text>
    <v-card-actions v-if="!error && !isDone">
      <action-button
        data-cy="udc-withdrawal-dialog__button"
        class="udc-withdrawal-dialog__button"
        :enabled="isValid && !accountBalanceTooLow"
        :text="$t('general.buttons.confirm')"
        @click="planWithdraw"
      />
    </v-card-actions>
    <v-card-text v-if="!error">
      <v-row class="udc-withdrawal-dialog__footnote" no-gutters>
        <span>
          <sup>{{ $t('udc.asterisk') }}</sup>
          {{ $t('udc.withdrawal-footnote') }}
        </span>
      </v-row>
    </v-card-text>
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
@import '@/scss/colors';

.udc-withdrawal-dialog {
  &__progress {
    margin-bottom: 15px;
    margin-top: 15px;
    color: $secondary-color;
  }

  &__done {
    width: 110px;
    height: 110px;
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

  &__footnote {
    margin-left: 5px;
  }
}
</style>
