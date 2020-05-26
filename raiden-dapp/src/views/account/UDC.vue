<template>
  <div>
    <v-row v-if="!loading && !error" justify="center" no-gutters>
      <v-col cols="6">
        <v-text-field
          v-model="amount"
          autofocus
          type="text"
          :suffix="udcToken.symbol || 'SVT'"
          class="mint-deposit-dialog__amount"
        />
      </v-col>
    </v-row>
    <v-row v-else-if="error" justify="center">
      <v-col cols="10">
        <error-message :error="error" />
      </v-col>
    </v-row>
    <v-row v-else class="mint-deposit-dialog--progress" justify="center">
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
    <v-row
      v-if="!loading && !error"
      class="mint-deposit-dialog__available"
      justify="center"
    >
      <p>
        {{
          $t('mint-deposit-dialog.available', {
            balance: accountBalance,
            currency: $t('app-header.currency')
          })
        }}
      </p>
    </v-row>
    <v-row justify="center">
      <action-button
        arrow
        :enabled="valid && !loading"
        :text="$t('mint-deposit-dialog.button')"
        class="mint-deposit-dialog__action"
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
        <p>
          UDC Balance:
          <amount-display inline :amount="udcCapacity" :token="udcToken" />
        </p>
        <p>
          Your SVT balance is too low to pay for the Monitoring Service.
          Receiving transfers has been temporarily disabled. Use the button aove
          to mint an deposit more tokens. A minimum amount of 5 SVT is needed to
          enable receiving.
        </p>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapState } from 'vuex';

import { Token } from '@/model/types';
import ActionButton from '@/components/ActionButton';
import AmountDisplay from '@/components/AmountDisplay';
import MintDepositDialog from '@/components/dialogs/MintDepositDialog';
import { RaidenError } from 'raiden-ts';
import { Zero } from 'ethers/constants';

@Component({
  components: { ActionButton, MintDepositDialog, AmountDisplay },
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

.udc {
}
</style>
