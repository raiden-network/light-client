<template>
  <raiden-dialog :visible="visible" @close="cancel">
    <v-card-title v-if="!error">
      {{ $t('udc-deposit-dialog.title') }}
    </v-card-title>

    <v-card-subtitle v-if="!error" class="udc-deposit-dialog__balance">
      {{
        $t('udc-deposit-dialog.available-utility-token', {
          utilityTokenSymbol: udcToken.symbol,
          utilityTokenBalance: utilityTokenBalance,
        })
      }}
    </v-card-subtitle>

    <v-card-text>
      <amount-input
        v-if="!loading && !error"
        v-model="defaultUtilityTokenAmount"
        :token="udcToken"
        :placeholder="$t('transfer.amount-placeholder')"
      />

      <error-message v-else-if="error" :error="error" />

      <div v-else class="udc-deposit-dialog--progress">
        <spinner />
        <span v-if="currentStepDescription">
          {{ currentStepDescription }}
        </span>
      </div>

      <a
        v-if="mainnet && !loading && !error"
        class="udc-deposit-dialog--uniswap-url"
        :href="uniswapURL"
        target="_blank"
      >
        {{ $t('udc-deposit-dialog.uniswap-url-title') }}
      </a>
    </v-card-text>

    <v-card-actions v-if="!error">
      <action-button
        arrow
        full-width
        :enabled="valid && !loading"
        :text="$t(mainnet ? 'udc-deposit-dialog.button-main' : 'udc-deposit-dialog.button')"
        data-cy="udc_deposit_dialog_action"
        class="udc-deposit-dialog__action"
        @click="udcDeposit()"
      />
    </v-card-actions>
  </raiden-dialog>
</template>

<script lang="ts">
import type { BigNumber } from 'ethers';
import { constants, utils } from 'ethers';
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';

import type { RaidenError } from 'raiden-ts';
import { DEFAULT_MS_REWARD } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import AmountInput from '@/components/AmountInput.vue';
import RaidenDialog from '@/components/dialogs/RaidenDialog.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import Spinner from '@/components/icons/Spinner.vue';
import Filters from '@/filters';
import type { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';

enum DepositSteps {
  MINT = 'mint',
  APPROVE = 'approve',
  DEPOSIT = 'deposit',
  NONE = 'none',
}

@Component({
  components: {
    ActionButton,
    RaidenDialog,
    ErrorMessage,
    Spinner,
    AmountInput,
  },
  computed: {
    ...mapState('userDepositContract', { udcToken: 'token' }),
    ...mapGetters(['mainnet']),
  },
})
export default class UdcDepositDialog extends Vue {
  mainnet!: boolean;
  uniswapURL = '';
  udcToken!: Token;
  defaultUtilityTokenAmount = '';
  step: DepositSteps = DepositSteps.NONE;
  loading = false;
  error: Error | RaidenError | null = null;

  @Prop({ required: true, type: Boolean })
  visible!: boolean;

  @Emit()
  cancel() {
    this.error = null;
  }

  get utilityTokenBalance(): string {
    return Filters.displayFormat(this.udcToken.balance as BigNumber, this.udcToken.decimals);
  }

  get valid(): boolean {
    let utilityTokenAmount: BigNumber;

    try {
      utilityTokenAmount = utils.parseUnits(
        this.defaultUtilityTokenAmount,
        this.udcToken.decimals,
      );
    } catch (err) {
      return false;
    }

    if (this.mainnet) {
      return (
        utilityTokenAmount.lte(this.udcToken.balance as BigNumber) &&
        utilityTokenAmount.gt(constants.Zero)
      );
    } else {
      return utilityTokenAmount.gt(constants.Zero);
    }
  }

  get currentStepDescription(): string {
    if (this.step === DepositSteps.NONE) {
      return '';
    } else {
      const translate_key = `udc-deposit-dialog.progress.${this.step.toString()}`;
      return this.$t(translate_key, { currency: this.udcToken.symbol }) as string;
    }
  }

  mounted() {
    const mainAccountAddress = this.$raiden.getMainAccount() ?? this.$raiden.getAccount();
    const defaultAmount = utils.formatEther(DEFAULT_MS_REWARD.mul(2));

    this.uniswapURL = `https://app.uniswap.org/#/swap?inputCurrency=ETH&outputCurrency=${this.udcToken.address}&exactAmount=${defaultAmount}&exactField=outPUT&recipient=${mainAccountAddress}`;

    this.defaultUtilityTokenAmount = this.mainnet ? this.utilityTokenBalance : defaultAmount;
  }

  async udcDeposit() {
    this.error = null;
    this.loading = true;
    const token = this.udcToken;
    const depositAmount = BalanceUtils.parse(this.defaultUtilityTokenAmount, token.decimals!);

    try {
      if (!this.mainnet && depositAmount.gt(token.balance!)) {
        this.step = DepositSteps.MINT;
        await this.$raiden.mint(token.address, depositAmount);
      }

      this.step = DepositSteps.APPROVE;

      await this.$raiden.depositToUDC(depositAmount, () => {
        this.step = DepositSteps.DEPOSIT;
      });
      this.$emit('done');
    } catch (e) {
      this.error = e;
    }

    this.step = DepositSteps.NONE;
    this.loading = false;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';

.udc-deposit-dialog {
  background-color: #141414;
  border-radius: 10px !important;
  padding: 20px 20px 55px 20px;

  &__balance {
    font-size: 14px;
    text-align: center;
    width: 100%;
  }

  &--progress {
    margin-top: 20px;
    span {
      margin-top: 22px;
    }
  }

  &--uniswap-url {
    text-decoration: none;
  }

  &__close {
    position: absolute;
    right: 15px;
    top: 15px;
  }
}
</style>
