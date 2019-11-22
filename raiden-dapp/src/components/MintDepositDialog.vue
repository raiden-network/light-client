<template>
  <v-card class="mint-deposit-dialog">
    <v-btn icon class="mint-deposit-dialog__close" @click="cancel">
      <v-icon>mdi-close</v-icon>
    </v-btn>
    <v-card-text>
      <v-row justify="center" no-gutters>
        <v-col cols="4">
          <v-text-field
            v-model="amount"
            autofocus
            type="text"
            :suffix="udcToken.symbol || 'SVT'"
            class="mint-deposit-dialog__amount"
          />
        </v-col>
      </v-row>
      <v-row v-if="error">
        <v-col cols="12" class="text-center error--text">
          {{ $t('mint-deposit-dialog.error') }}
        </v-col>
      </v-row>
      <v-row class="mint-deposit-dialog__available">
        {{
          $t('mint-deposit-dialog.available', {
            balance: accountBalance,
            currency: $t('app-header.currency')
          })
        }}
      </v-row>
    </v-card-text>
    <v-card-actions>
      <action-button
        sticky
        arrow
        :loading="loading"
        :enabled="valid && !loading"
        :text="$t('mint-deposit-dialog.button')"
        class="mint-deposit-dialog__action"
        @click="mintDeposit()"
      >
      </action-button>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue, Emit } from 'vue-property-decorator';
import { mapState } from 'vuex';

import ActionButton from '@/components/ActionButton.vue';
import { BalanceUtils } from '@/utils/balance-utils';
import { Token } from '@/model/types';

@Component({
  components: { ActionButton },
  computed: {
    ...mapState(['accountBalance'])
  }
})
export default class MintDepositDialog extends Vue {
  amount: string = '10';
  loading: boolean = false;
  error: boolean = false;

  get udcToken(): Token {
    const address = this.$raiden.userDepositTokenAddress;
    return this.$store.state.tokens[address] || ({ address } as Token);
  }

  get valid(): boolean {
    return /^[1-9]\d*$/.test(this.amount);
  }

  @Emit()
  cancel() {}

  async mintDeposit() {
    this.error = false;
    this.loading = true;
    try {
      const tokenAddress = this.$raiden.userDepositTokenAddress;
      const token = this.$store.state.tokens[tokenAddress];
      const depositAmount = BalanceUtils.parse(this.amount, token.decimals);
      await this.$raiden.mint(tokenAddress, depositAmount);
      await this.$raiden.depositToUDC(depositAmount);
      this.$emit('done');
    } catch (e) {
      this.error = true;
    }

    this.loading = false;
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.mint-deposit-dialog {
  background-color: #141414;
  border-radius: 10px !important;
  padding: 20px 20px 55px 20px;

  &__amount {
    font-size: 24px;
    font-weight: bold;
    color: $color-white;

    & ::v-deep input {
      text-align: right;
    }

    & ::v-deep .v-input__slot::before {
      border: none !important;
    }

    & ::v-deep .v-input__slot::after {
      border: none !important;
    }

    & ::v-deep .v-text-field__details {
      display: none;
    }

    & ::v-deep .v-text-field__suffix {
      padding-left: 8px;
      color: white;
      padding-right: 18px;
    }
  }

  &__available {
    text-align: center;
  }

  &__close {
    position: absolute;
    right: 15px;
    top: 15px;
  }
}
</style>
