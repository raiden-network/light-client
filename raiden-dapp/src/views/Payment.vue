<template>
  <v-form v-model="valid" autocomplete="off" class="payment">
    <v-layout column justify-space-between fill-height>
      <v-layout align-center justify-center class="payment__recipient">
        <v-flex xs10>
          <div class="payment__recipient__label">
            {{ $t('payment.recipient-label') }}
          </div>
          <address-input v-model="target" :exclude="[token.address, defaultAccount]"></address-input>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center>
        <v-flex xs10>
          <amount-input
            v-model="amount"
            :token="token"
            :label="$t('payment.amount-label')"
            :placeholder="$t('payment.amount-placeholder')"
            :max="capacity"
            limit
          ></amount-input>
        </v-flex>
      </v-layout>

      <v-layout class="payment__capacity" justify-center>
        <v-flex xs5>
          <v-layout column>
            <span class="payment__capacity__label">
              {{ $t('payment.capacity-label') }}
            </span>
            <span class="payment__capacity__amount">
              {{
                $t('payment.capacity-amount', {
                  capacity: convertToUnits(capacity, token.decimals),
                  token: token.symbol
                })
              }}
            </span>
          </v-layout>
        </v-flex>
        <v-flex xs2 offset-xs3 align-self-end>
          <v-dialog v-model="depositting" max-width="450">
            <template #activator="{ on }">
              <v-btn
                @click="depositting = true"
                v-on="on"
                text
                class="payment__capacity__deposit"
              >
                {{ $t('payment.deposit-button') }}
              </v-btn>
            </template>
            <v-card class="payment__deposit-dialog">
              <channel-deposit
                @cancel="depositting = false"
                @confirm="deposit($event)"
                :token="token"
                identifier="0"
              ></channel-deposit>
            </v-card>
          </v-dialog>
        </v-flex>
      </v-layout>

      <v-spacer></v-spacer>

      <action-button
        :enabled="valid"
        @click="transfer()"
        :text="$t('payment.pay-button')"
        class="payment__pay-button"
      ></action-button>

      <stepper
        :display="loading"
        :steps="steps"
        :done-step="doneStep"
        :done="done"
      ></stepper>

      <error-screen
        :description="error"
        @dismiss="error = ''"
        :title="errorTitle"
        :button-label="$t('payment.error.button')"
      ></error-screen>
    </v-layout>
  </v-form>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import {
  emptyDescription,
  StepDescription,
  Token,
  TokenPlaceholder
} from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import Stepper from '@/components/Stepper.vue';
import ErrorScreen from '@/components/ErrorScreen.vue';
import Divider from '@/components/Divider.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';
import ChannelDeposit from '@/components/ChannelDeposit.vue';
import { BigNumber } from 'ethers/utils';
import { mapGetters, mapState } from 'vuex';
import { RaidenChannel } from 'raiden-ts';
import { Zero } from 'ethers/constants';

@Component({
  components: {
    ChannelDeposit,
    ActionButton,
    TokenInformation,
    Divider,
    AddressInput,
    AmountInput,
    Stepper,
    ErrorScreen
  },
  computed: {
    ...mapState(['defaultAccount']),
    ...mapGetters(['channelWithBiggestCapacity'])
  }
})
export default class Payment extends Vue {
  target: string = '';
  token: Token = TokenPlaceholder;
  defaultAccount!: string;
  amount: string = '';

  valid: boolean = false;
  loading: boolean = false;
  done: boolean = false;

  errorTitle: string = '';
  error: string = '';

  channelWithBiggestCapacity!: (
    tokenAddress: string
  ) => RaidenChannel | undefined;

  get capacity(): BigNumber {
    const withBiggestCapacity = this.channelWithBiggestCapacity(
      this.token.address
    );
    if (withBiggestCapacity) {
      return withBiggestCapacity.capacity;
    }
    return Zero;
  }

  depositting: boolean = false;

  steps: StepDescription[] = [];
  doneStep: StepDescription = emptyDescription();

  convertToUnits = BalanceUtils.toUnits;

  async created() {
    const { token } = this.$route.params;
    this.token = (await this.$raiden.getToken(token)) || TokenPlaceholder;
  }

  async deposit(amount: BigNumber) {
    this.steps = [(this.$t('payment.steps.deposit') as any) as StepDescription];
    this.doneStep = (this.$t(
      'payment.steps.deposit-done'
    ) as any) as StepDescription;
    this.errorTitle = this.$t('payment.error.deposit-title') as string;

    this.loading = true;

    try {
      await this.$raiden.deposit(
        this.token.address,
        this.channelWithBiggestCapacity(this.token.address)!.partner,
        amount
      );
      this.done = true;
      this.dismissProgress();
    } catch (e) {
      this.loading = false;
      this.depositting = false;
      this.error = e.message;
    }
  }

  async transfer() {
    this.steps = [
      (this.$t('payment.steps.transfer') as any) as StepDescription
    ];
    this.doneStep = (this.$t('payment.steps.done') as any) as StepDescription;
    this.errorTitle = this.$t('payment.error.title') as string;

    const { address, decimals } = this.token;

    try {
      this.loading = true;
      await this.$raiden.transfer(
        address,
        this.target,
        BalanceUtils.parse(this.amount, decimals)
      );
      this.done = true;
      this.dismissProgress();
    } catch (e) {
      this.loading = false;
      this.error = e.message;
    }
  }

  private dismissProgress() {
    setTimeout(() => {
      this.loading = false;
      this.done = false;
    }, 2000);
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';
.payment {
  width: 100%;
  height: 100%;
}

.payment__capacity {
  max-height: 50px;
}

.payment__capacity__label {
  color: $secondary-color;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 3px;
  line-height: 15px;
  text-transform: uppercase;
}

.payment__capacity__amount {
  color: $text-color;
  font-size: 16px;
  line-height: 19px;
  padding-left: 11px;
  margin-top: 10px;
}

.payment__capacity__deposit {
  color: $primary-color;
  font-size: 14px;
  font-weight: 500;
  line-height: 21px;
}

.payment__recipient {
  margin-top: 75px;
}

.payment__recipient,
.payment__amount {
  max-height: 150px;
}

.payment__recipient__label {
  color: $secondary-color;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 3px;
  line-height: 15px;
  text-transform: uppercase;
}

.payment__pay-button {
  margin-bottom: 24px;
}
</style>
