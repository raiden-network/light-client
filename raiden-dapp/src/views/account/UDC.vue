<template>
  <div data-cy="udc" class="udc">
    <div class="udc__content-box">
      <amount-display class="udc__amount" :amount="udcCapacity" :token="udcToken" />

      <div>
        {{ $t('udc.balance') | upperCase }}
      </div>

      <div v-if="!hasEnoughServiceTokens" class="udc__content-box udc__content-box--nested">
        <v-icon color="#84878A" size="16px">mdi-alert-outline</v-icon>
        <span>
          {{ $t('udc.balance-too-low', { minAmount, tokenSymbol: serviceTokenSymbol }) }}
        </span>
      </div>
    </div>

    <div class="udc__actions">
      <div
        class="udc__actions__button"
        data-cy="udc__actions__button__deposit"
        @click="showUdcDeposit = true"
      >
        <img :src="require('@/assets/icon-deposit.svg')" />
        {{ $t('udc.deposit') }}
      </div>

      <div
        data-cy="udc__actions__button__withdrawal"
        class="udc__actions__button"
        @click="withdrawFromUdc = true"
      >
        <img :src="require('@/assets/icon-withdraw.svg')" />
        {{ $t('udc.withdrawal') }}
      </div>
    </div>

    <div class="udc__content-box">
      <div class="udc__content-box__header">
        {{ $t('udc.withdrawal-header') }}
      </div>

      <planned-udc-withdrawal-information
        :planned-withdrawal="plannedUdcWithdrawal"
        :udc-token="udcToken"
      />
    </div>
    <udc-deposit-dialog
      :visible="showUdcDeposit"
      @cancel="showUdcDeposit = false"
      @done="mintDone()"
    />
    <udc-withdrawal-dialog
      :visible="withdrawFromUdc"
      :account-balance="relevantEthBalanceForWithdrawal"
      :token="udcToken"
      :capacity="udcCapacity"
      @cancel="withdrawFromUdc = false"
    />
  </div>
</template>

<script lang="ts">
import { constants, utils } from 'ethers';
import { Component, Vue } from 'vue-property-decorator';
import { createNamespacedHelpers, mapGetters, mapState } from 'vuex';

import { DEFAULT_MS_REWARD } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import UdcDepositDialog from '@/components/dialogs/UdcDepositDialog.vue';
import UdcWithdrawalDialog from '@/components/dialogs/UdcWithdrawalDialog.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import Spinner from '@/components/icons/Spinner.vue';
import PlannedUdcWithdrawalInformation from '@/components/PlannedUdcWithdrawalInformation.vue';
import type { Token } from '@/model/types';
import type { PlannedUdcWithdrawal } from '@/store/user-deposit-contract';

const { mapState: mapStateUserSettings } = createNamespacedHelpers('userSettings');
const { mapState: mapStateUserDepositContract } = createNamespacedHelpers('userDepositContract');

const UDC_SECURITY_MARGIN_PERCENTAGE = 10;

@Component({
  components: {
    ActionButton,
    UdcDepositDialog,
    UdcWithdrawalDialog,
    AmountDisplay,
    ErrorMessage,
    Spinner,
    PlannedUdcWithdrawalInformation,
  },
  computed: {
    ...mapState(['accountBalance', 'raidenAccountBalance']),
    ...mapStateUserSettings(['useRaidenAccount']),
    ...mapStateUserDepositContract({
      udcToken: 'token',
      plannedUdcWithdrawal: 'plannedWithdrawal',
    }),
    ...mapGetters(['mainnet']),
  },
})
export default class UDC extends Vue {
  amount = utils.formatEther(DEFAULT_MS_REWARD.mul(2));
  minAmount = +utils.formatEther(
    DEFAULT_MS_REWARD.add(DEFAULT_MS_REWARD.mul(UDC_SECURITY_MARGIN_PERCENTAGE).div(100)),
  );
  udcCapacity = constants.Zero;
  hasEnoughServiceTokens = false;
  accountBalance!: string;
  raidenAccountBalance!: string;
  mainnet!: boolean;
  udcToken!: Token;
  plannedUdcWithdrawal!: PlannedUdcWithdrawal | undefined;
  useRaidenAccount!: boolean;
  showUdcDeposit = false;
  withdrawFromUdc = false;

  get serviceTokenSymbol(): string {
    return this.udcToken.symbol ?? (this.mainnet ? 'RDN' : 'SVT');
  }

  get relevantEthBalanceForWithdrawal(): string {
    return this.useRaidenAccount ? this.raidenAccountBalance : this.accountBalance;
  }

  async mounted() {
    await this.updateUDCCapacity();
  }

  private async updateUDCCapacity() {
    const { monitoringReward } = this.$raiden;
    this.udcCapacity = await this.$raiden.getUDCCapacity();
    this.hasEnoughServiceTokens = !!(monitoringReward && this.udcCapacity.gte(monitoringReward));
  }

  async mintDone() {
    this.showUdcDeposit = false;
    await this.updateUDCCapacity();
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

hr {
  border: solid 1px $secondary-text-color;
  margin-top: 50px;
}

.udc {
  padding: 26px;

  > div {
    margin-bottom: 16px;
  }

  &__content-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 16px;
    border-radius: 8px;
    color: #7a7a80;
    background-color: #1c1c1c;
    font-size: 12px;
    line-height: 18px;

    &--nested {
      flex-direction: row;
      width: auto;
      color: #84878a;
      background-color: #262829;
      padding: 4px 8px;

      > * {
        margin: 0 4px;
      }
    }

    &__header {
      font-size: 15px;
      align-self: flex-start;
    }

    > div {
      margin-bottom: 8px;
    }
  }

  &__amount {
    color: #ffffff;
    font-size: 31px;
    line-height: 47px;
  }

  &__actions {
    display: flex;

    &__button {
      display: flex;
      flex-grow: 1;
      align-items: center;
      justify-content: center;
      height: 40px;
      border-radius: 8px;
      color: #44ddff;
      background-color: #182d32;
      font-size: 14px;
      line-height: 16px;

      &:not(:last-child) {
        margin-right: 16px;
      }

      &:hover {
        background-color: #213e45;
        cursor: pointer;
      }

      img {
        margin-right: 5px;
      }
    }
  }
}
</style>
