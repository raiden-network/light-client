<template>
  <div data-cy="udc" class="udc">
    <v-row class="udc__description" no-gutters>
      {{ $t('udc.description') }}
    </v-row>
    <v-row class="udc__balance" no-gutters justify="center">
      {{ $t('udc.balance') }}
      <amount-display
        class="udc__balance__amount"
        inline
        :amount="udcCapacity"
        :token="udcToken"
      />
    </v-row>
    <v-row class="udc__actions" no-gutters justify="center">
      <v-btn
        text
        data-cy="udc_actions_button"
        class="udc__actions__button"
        @click="showUdcDeposit = true"
      >
        <v-img width="60px" height="55px" :src="require('../../assets/deposit.svg')" />
        <span class="udc__actions__button--title">
          {{ $t('udc.deposit') }}
        </span>
      </v-btn>
      <v-btn
        text
        data-cy="udc_actions_button"
        class="udc__actions__button"
        @click="withdrawFromUdc = true"
      >
        <v-img width="60px" height="55px" :src="require('../../assets/withdrawal.svg')" />
        <span class="udc__actions__button--title">
          {{ $t('udc.withdrawal') }}
        </span>
      </v-btn>
    </v-row>
    <v-row no-gutters justify="center">
      <v-col cols="10">
        <hr />
      </v-col>
    </v-row>
    <v-row v-if="!hasEnoughServiceTokens" class="udc__low-balance" no-gutters>
      {{ $t('udc.balance-too-low', { symbol: serviceToken }) }}
    </v-row>
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
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';
import { constants } from 'ethers';

import { Token } from '@/model/types';
import ActionButton from '@/components/ActionButton.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import UdcDepositDialog from '@/components/dialogs/UdcDepositDialog.vue';
import UdcWithdrawalDialog from '@/components/dialogs/UdcWithdrawalDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';

@Component({
  components: {
    ActionButton,
    UdcDepositDialog,
    UdcWithdrawalDialog,
    AmountDisplay,
    ErrorMessage,
    Spinner,
  },
  computed: {
    ...mapState(['accountBalance', 'raidenAccountBalance']),
    ...mapGetters(['mainnet', 'udcToken', 'usingRaidenAccount']),
  },
})
export default class UDC extends Vue {
  amount = '10';
  udcCapacity = constants.Zero;
  hasEnoughServiceTokens = false;
  accountBalance!: string;
  raidenAccountBalance!: string;
  mainnet!: boolean;
  udcToken!: Token;
  usingRaidenAccount!: boolean;
  showUdcDeposit = false;
  withdrawFromUdc = false;

  get serviceToken(): string {
    return this.udcToken.symbol ?? (this.mainnet ? 'RDN' : 'SVT');
  }

  get relevantEthBalanceForWithdrawal(): string {
    return this.usingRaidenAccount ? this.raidenAccountBalance : this.accountBalance;
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
  &__description {
    margin: 30px 60px 0 60px;
    text-align: center;
  }

  &__balance {
    font-size: 24px;
    margin-top: 80px;

    &__amount {
      padding: 1px 0 0 10px;
    }
  }

  &__actions {
    margin-top: 30px;

    &__button {
      height: 75px !important;

      &--title {
        font-size: 18px;
        max-width: 0;
        overflow: hidden;
        padding-left: 15px;
        transition: max-width 0.5s;
      }

      &:hover {
        span {
          max-width: 145px;
        }
      }
    }
  }

  &__low-balance {
    color: $error-color;
    font-size: 14px;
    margin: 20px 52px 0 52px;
  }
}
</style>
