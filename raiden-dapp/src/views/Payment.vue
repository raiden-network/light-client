<template>
  <v-form v-model="valid" autocomplete="off" class="payment">
    <v-layout column justify-space-between fill-height>
      <v-layout class="payment__capacity" justify-center>
        <v-flex xs7 class="payment__capacity_capacity-column">
          <v-layout column>
            <span class="payment__capacity__label">{{
              $t('payment.capacity-label')
            }}</span>
            <span
              v-if="typeof token.decimals === 'number'"
              class="payment__capacity__amount"
            >
              {{
                $t('payment.capacity-amount', {
                  capacity: convertToUnits(capacity, token.decimals),
                  token: token.symbol
                })
              }}
            </span>
            <span v-else class="payment__capacity__amount"></span>
          </v-layout>
          <v-img
            :src="require('../assets/down_arrow.svg')"
            max-width="18px"
            class="payment__capacity__arrow"
          ></v-img>
        </v-flex>
        <v-flex xs3 align-center class="payment__capacity__deposit-column">
          <v-dialog v-model="depositing" max-width="625">
            <template #activator="{ on }">
              <v-btn
                @click="depositing = true"
                v-on="on"
                text
                class="payment__capacity__deposit"
                >{{ $t('payment.deposit-button') }}</v-btn
              >
            </template>
            <v-card class="payment__deposit-dialog">
              <channel-deposit
                @cancel="depositing = false"
                @confirm="deposit($event)"
                :token="token"
                identifier="0"
              ></channel-deposit>
            </v-card>
          </v-dialog>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center class="payment__recipient">
        <v-flex xs10>
          <div class="payment__recipient__label">
            {{ $t('payment.recipient-label') }}
          </div>
          <address-input
            v-model="target"
            :exclude="[token.address, defaultAccount]"
            :block="blockedHubs"
          ></address-input>
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

      <v-spacer></v-spacer>

      <v-dialog v-model="findingRoutes" max-width="625">
        <template #activator="{ on }">
          <action-button
            :enabled="valid"
            @click="findingRoutes = true"
            :text="$t('payment.pay-button')"
            v-on="on"
            class="payment__pay-button"
          ></action-button>
        </template>
        <v-card class="payment__route-dialog">
          <find-routes
            v-if="findingRoutes"
            @cancel="findingRoutes = false"
            @confirm="transfer($event)"
            :token="token"
            :amount="amount"
            :target="target"
          ></find-routes>
        </v-card>
      </v-dialog>

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
import { Component, Mixins } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import { emptyDescription, StepDescription, Token, Route } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import Stepper from '@/components/Stepper.vue';
import ErrorScreen from '@/components/ErrorScreen.vue';
import Divider from '@/components/Divider.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';
import ChannelDeposit from '@/components/ChannelDeposit.vue';
import FindRoutes from '@/components/FindRoutes.vue';
import { BigNumber } from 'ethers/utils';
import { mapGetters, mapState } from 'vuex';
import { RaidenChannel, ChannelState, RaidenPaths } from 'raiden-ts';
import { Zero } from 'ethers/constants';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import { getAddress, getAmount } from '@/utils/query-params';

@Component({
  components: {
    ChannelDeposit,
    ActionButton,
    TokenInformation,
    Divider,
    AddressInput,
    AmountInput,
    Stepper,
    ErrorScreen,
    FindRoutes
  },
  computed: {
    ...mapState(['defaultAccount']),
    ...mapGetters(['channelWithBiggestCapacity', 'channels'])
  }
})
export default class Payment extends Mixins(NavigationMixin) {
  target: string = '';

  defaultAccount!: string;
  amount: string = '';

  valid: boolean = false;
  loading: boolean = false;
  done: boolean = false;
  depositing: boolean = false;
  findingRoutes: boolean = false;

  errorTitle: string = '';
  error: string = '';

  steps: StepDescription[] = [];
  doneStep: StepDescription = emptyDescription();

  convertToUnits = BalanceUtils.toUnits;

  channels!: (tokenAddress: string) => RaidenChannel[];

  channelWithBiggestCapacity!: (
    tokenAddress: string
  ) => RaidenChannel | undefined;

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.$store.getters.token(address) || ({ address } as Token);
  }

  get blockedHubs(): string[] {
    return this.channels(this.token.address)
      .filter((channel: RaidenChannel) => channel.state !== ChannelState.open)
      .map((channel: RaidenChannel) => channel.partner as string);
  }

  get capacity(): BigNumber {
    const withBiggestCapacity = this.channelWithBiggestCapacity(
      this.token.address
    );
    if (withBiggestCapacity) {
      return withBiggestCapacity.capacity;
    }
    return Zero;
  }

  async created() {
    const { amount, target } = this.$route.query;

    this.amount = getAmount(amount);
    this.target = getAddress(target);

    const { token: address } = this.$route.params;

    if (!AddressUtils.checkAddressChecksum(address)) {
      this.navigateToHome();
      return;
    }

    await this.$raiden.fetchTokenData([address]);

    if (typeof this.token.decimals !== 'number') {
      this.navigateToHome();
    }
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
      this.error = e.message;
    }
    this.loading = false;
    this.depositing = false;
  }

  async transfer(route?: Route) {
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
        BalanceUtils.parse(this.amount, decimals!),
        route
          ? ({ paths: [{ path: route.path, fee: route.fee }] } as RaidenPaths)
          : undefined
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
  position: relative;
  background-image: linear-gradient(180deg, #050505 0%, #0a1923 100%);
}

.payment__capacity__deposit-column {
  justify-content: flex-end;
  display: flex;
}

.payment__capacity_capacity-column {
  align-self: center;
}

.payment__capacity__arrow {
  position: absolute;
  left: calc(50% - 9px);
  bottom: 10px;
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
  color: $color-white;
  font-size: 24px;
  font-weight: bold;
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
