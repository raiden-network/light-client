<template>
  <div>
    <v-row justify="center">
      <v-col cols="10">
        <p>
          {{ $t('udc.description') }}
        </p>
      </v-col>
    </v-row>
    <v-row justify="center">
      <v-col cols="10">
        <h3 class="udc__sub-head">{{ $t('udc.mint-deposit') }}</h3>
      </v-col>
    </v-row>
    <v-row v-if="!loading && !error" justify="center" no-gutters>
      <v-col cols="6">
        <v-text-field
          v-model="amount"
          autofocus
          type="text"
          :suffix="udcToken.symbol || 'SVT'"
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
              $t('mint-deposit-dialog.progress.mint', {
                currency: udcToken.symbol || 'SVT'
              })
            }}
          </span>
          <span v-else-if="step === 'approve'">
            {{
              $t('mint-deposit-dialog.progress.approve', {
                currency: udcToken.symbol || 'SVT'
              })
            }}
          </span>
          <span v-else-if="step === 'deposit'">
            {{
              $t('mint-deposit-dialog.progress.deposit', {
                currency: udcToken.symbol || 'SVT'
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
            $t('mint-deposit-dialog.available', {
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
        :text="$t('mint-deposit-dialog.button')"
        class="udc__action"
        @click="mintDeposit()"
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
        </p>
        <p
          v-if="!hasEnoughServiceTokens"
          :class="{
            'udc__low-balance': !hasEnoughServiceTokens
          }"
        >
          {{ $t('udc.balance-too-low') }}
        </p>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { RaidenError } from 'raiden-ts';
import { Zero } from 'ethers/constants';

import { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import ActionButton from '@/components/ActionButton.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import ErrorMessage from '@/components/ErrorMessage.vue';
import MintDepositDialog from '@/components/dialogs/MintDepositDialog.vue';

@Component({
  components: { ActionButton, MintDepositDialog, AmountDisplay, ErrorMessage },
  computed: {
    ...mapState(['accountBalance'])
  }
})
export default class UDC extends Vue {
  amount: string = '10';
  loading: boolean = false;
  error: Error | RaidenError | null = null;
  step: 'mint' | 'approve' | 'deposit' | '' = '';
  udcCapacity = Zero;
  hasEnoughServiceTokens = false;

  get udcToken(): Token {
    const address = this.$raiden.userDepositTokenAddress;
    return this.$store.state.tokens[address] || ({ address } as Token);
  }

  async mounted() {
    await this.updateUDCCapacity();
  }

  get valid(): boolean {
    return /^[1-9]\d*$/.test(this.amount);
  }

  async mintDeposit() {
    this.error = null;
    this.loading = true;

    const tokenAddress = this.$raiden.userDepositTokenAddress;
    const token: Token = this.$store.state.tokens[tokenAddress];
    const depositAmount = BalanceUtils.parse(this.amount, token.decimals!);

    try {
      if (depositAmount.gt(token.balance!)) {
        this.step = 'mint';
        await this.$raiden.mint(tokenAddress, depositAmount);
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
    const { userDepositTokenAddress, monitoringReward } = this.$raiden;
    await this.$raiden.fetchTokenData([userDepositTokenAddress]);
    this.udcCapacity = await this.$raiden.getUDCCapacity();
    if (monitoringReward && this.udcCapacity.gte(monitoringReward)) {
      this.hasEnoughServiceTokens = true;
    } else {
      this.hasEnoughServiceTokens = false;
    }
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
}
</style>
