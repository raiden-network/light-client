<template>
  <div>
    <v-row class="udc__description" justify="center" no-gutters>
      <p>
        {{ $t('udc.description') }}
      </p>
    </v-row>
    <v-row justify="center">
      <v-col cols="10">
        <h3 class="udc__sub-head">
          {{ $t(mainnet ? 'udc.deposit' : 'udc.mint-deposit') }}
        </h3>
      </v-col>
    </v-row>
    <v-row v-if="!loading && !error" justify="center" no-gutters>
      <v-col cols="6">
        <v-text-field
          v-model="amount"
          autofocus
          type="text"
          :suffix="serviceToken"
          class="udc__mint-deposit--amount"
        />
      </v-col>
    </v-row>
    <v-row v-else-if="error" justify="center">
      <v-col cols="10">
        <error-message :error="error" />
      </v-col>
    </v-row>
    <v-row v-else class="udc__progress" justify="center">
      <v-col cols="10">
        <v-row no-gutters align="center" justify="center">
          <v-progress-circular
            :size="125"
            :width="4"
            color="primary"
            indeterminate
          ></v-progress-circular>
        </v-row>
        <v-row no-gutters align="center" justify="center">
          <span v-if="step === 'mint'">
            {{
              $t('udc-deposit-dialog.progress.mint', {
                currency: serviceToken
              })
            }}
          </span>
          <span v-else-if="step === 'approve'">
            {{
              $t('udc-deposit-dialog.progress.approve', {
                currency: serviceToken
              })
            }}
          </span>
          <span v-else-if="step === 'deposit'">
            {{
              $t('udc-deposit-dialog.progress.deposit', {
                currency: serviceToken
              })
            }}
          </span>
        </v-row>
      </v-col>
    </v-row>
    <v-row v-if="!loading && !error" justify="center">
      <v-col cols="10" class="text-center">
        <p>
          {{
            $t('udc-deposit-dialog.available', {
              balance: accountBalance,
              currency: $t('app-header.currency')
            })
          }}
        </p>
      </v-col>
    </v-row>
    <v-row v-if="!loading && !error" justify="center">
      <action-button
        arrow
        :enabled="valid && !loading"
        :text="
          $t(
            mainnet
              ? 'udc-deposit-dialog.button-main'
              : 'udc-deposit-dialog.button'
          )
        "
        class="udc__action"
        @click="udcDeposit()"
      />
    </v-row>
    <v-row justify="center">
      <v-col cols="10">
        <hr />
      </v-col>
    </v-row>
    <v-row justify="center">
      <v-col cols="10">
        <p
          :class="{
            'udc__low-balance': !hasEnoughServiceTokens
          }"
        >
          {{ $t('udc.balance') }}
          <amount-display inline :amount="udcCapacity" :token="udcToken" />
          <v-btn
            v-if="hasEnoughServiceTokens"
            class="udc__withdrawal-button"
            height="20px"
            width="22px"
            icon
            @click="withdrawFromUdc = true"
          >
            <v-img
              height="20px"
              width="20px"
              :src="require('@/assets/withdrawal.svg')"
            ></v-img>
          </v-btn>
        </p>
        <p
          v-if="!hasEnoughServiceTokens"
          :class="{
            'udc__low-balance': !hasEnoughServiceTokens
          }"
        >
          {{
            $t('udc.balance-too-low', {
              symbol: serviceToken
            })
          }}
        </p>
      </v-col>
    </v-row>
    <udc-withdrawal-dialog
      :visible="withdrawFromUdc"
      :account-balance="accountBalance"
      :token="udcToken"
      :capacity="udcCapacity"
      @cancel="withdrawFromUdc = false"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';
import { RaidenError } from 'raiden-ts';
import { Zero } from 'ethers/constants';

import { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import ActionButton from '@/components/ActionButton.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import UdcDepositDialog from '@/components/dialogs/UdcDepositDialog.vue';
import UdcWithdrawalDialog from '@/components/dialogs/UdcWithdrawalDialog.vue';

@Component({
  components: {
    ActionButton,
    UdcDepositDialog,
    UdcWithdrawalDialog,
    AmountDisplay,
    ErrorMessage
  },
  computed: {
    ...mapState(['accountBalance']),
    ...mapGetters(['mainnet', 'udcToken'])
  }
})
export default class UDC extends Vue {
  amount: string = '10';
  loading: boolean = false;
  error: Error | RaidenError | null = null;
  step: 'mint' | 'approve' | 'deposit' | '' = '';
  udcCapacity = Zero;
  hasEnoughServiceTokens = false;
  mainnet!: boolean;
  udcToken!: Token;
  withdrawFromUdc: boolean = false;

  get serviceToken(): string {
    return this.udcToken.symbol ?? (this.mainnet ? 'RDN' : 'SVT');
  }

  async mounted() {
    await this.updateUDCCapacity();
  }

  get valid(): boolean {
    return /^[1-9]\d*$/.test(this.amount);
  }

  async udcDeposit() {
    this.error = null;
    this.loading = true;

    const token: Token = this.udcToken;
    const depositAmount = BalanceUtils.parse(this.amount, token.decimals!);

    try {
      if (!this.mainnet && depositAmount.gt(token.balance!)) {
        this.step = 'mint';
        await this.$raiden.mint(token.address, depositAmount);
      }

      this.step = 'approve';
      await this.$raiden.depositToUDC(depositAmount, () => {
        this.step = 'deposit';
      });
      await this.updateUDCCapacity();
      this.$emit('done');
    } catch (e) {
      this.error = e;
    }

    this.step = '';
    this.loading = false;
  }

  private async updateUDCCapacity() {
    const { monitoringReward } = this.$raiden;
    this.udcCapacity = await this.$raiden.getUDCCapacity();
    this.hasEnoughServiceTokens = !!(
      monitoringReward && this.udcCapacity.gte(monitoringReward)
    );
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

hr {
  border: 0.5px solid #707070;
  margin-top: 5px;
}

.udc {
  &__description {
    margin-top: 30px;
    padding: 0 20px 0 20px;
    text-align: center;
  }

  &__sub-head {
    font-size: 20px;
    text-align: center;
  }

  &__low-balance {
    color: $error-color;
  }

  &__progress {
    margin-top: 20px;
    span {
      margin-top: 22px;
    }
  }

  &__mint-deposit {
    &--amount {
      font-size: 24px;
      font-weight: bold;
      color: $color-white;

      ::v-deep {
        input {
          text-align: center;
          max-width: 40px;
          max-height: none;
        }

        .v-input {
          &__slot {
            &::before {
              border: none !important;
            }

            &::after {
              border: none !important;
            }
          }
        }

        .v-text-field {
          &__details {
            display: none;
          }

          &__slot {
            justify-content: center;
          }

          &__suffix {
            padding-left: 8px;
            color: white;
            padding-right: 18px;
          }
        }
      }
    }
  }

  &__withdrawal-button {
    margin-left: 20px;
  }
}
</style>
