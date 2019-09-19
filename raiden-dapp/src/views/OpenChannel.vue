<template>
  <v-form v-model="valid" autocomplete="off" class="open-channel">
    <v-layout column justify-space-between fill-height>
      <v-layout align-center justify-center>
        <v-flex xs10>
          <amount-input
            v-model="deposit"
            :token="token"
            :max="token.balance"
            limit
          ></amount-input>
        </v-flex>
      </v-layout>

      <divider></divider>

      <token-information :token="token"></token-information>

      <divider></divider>

      <v-layout align-center justify-center class="open-channel__hub">
        <v-flex xs2 class="open-channel__hub__label text-left">
          {{ $t('open-channel.hub') }}
        </v-flex>
        <v-flex xs8 class="open-channel__hub__address text-left">
          {{ partner }}
        </v-flex>
      </v-layout>

      <action-button
        :enabled="valid"
        @click="openChannel()"
        :text="$t('open-channel.open-button')"
      ></action-button>

      <stepper
        :display="loading"
        :steps="steps"
        :done-step="doneStep"
        :current="current"
        :done="done"
      ></stepper>

      <error-screen
        :description="error"
        @dismiss="error = ''"
        :title="$t('open-channel.error.title')"
        :button-label="$t('open-channel.error.button')"
      ></error-screen>
    </v-layout>
  </v-form>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import AmountInput from '../components/AmountInput.vue';
import {
  ChannelDepositFailed,
  ChannelOpenFailed
} from '@/services/raiden-service';
import { emptyDescription, StepDescription, Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import Stepper from '@/components/Stepper.vue';
import { Zero } from 'ethers/constants';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import { Route } from 'vue-router';
import ErrorScreen from '@/components/ErrorScreen.vue';
import Divider from '@/components/Divider.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';
import { mapGetters } from 'vuex';
import { getAmount } from '@/utils/query-params';

@Component({
  components: {
    TokenInformation,
    Divider,
    ErrorScreen,
    Stepper,
    ActionButton,
    AmountInput
  },
  computed: {
    ...mapGetters({
      getToken: 'token'
    })
  }
})
export default class OpenChannel extends Mixins(NavigationMixin) {
  partner: string = '';
  getToken!: (address: string) => Token;

  deposit: string = '0.00';

  valid: boolean = false;
  loading: boolean = false;
  error: string = '';

  steps: StepDescription[] = [];

  doneStep: StepDescription = emptyDescription();
  current = 0;
  done = false;

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.getToken(address) || ({ address } as Token);
  }

  beforeRouteLeave(to: Route, from: Route, next: any) {
    if (!this.loading) {
      next();
    } else {
      if (window.confirm(this.$t('open-channel.confirmation') as string)) {
        next();
      } else {
        next(false);
      }
    }
  }

  async openChannel() {
    const { address, decimals } = this.token;
    const depositAmount = BalanceUtils.parse(this.deposit, decimals!);

    if (depositAmount.eq(Zero)) {
      this.steps = [
        (this.$t('open-channel.steps.open') as any) as StepDescription
      ];
    } else {
      this.steps = [
        (this.$t('open-channel.steps.open') as any) as StepDescription,
        (this.$t('open-channel.steps.transfer') as any) as StepDescription,
        (this.$t('open-channel.steps.deposit') as any) as StepDescription
      ];
    }

    this.loading = true;

    try {
      await this.$raiden.openChannel(
        address,
        this.partner,
        depositAmount,
        progress => (this.current = progress.current - 1)
      );

      this.done = true;
      setTimeout(() => {
        this.loading = false;
        this.navigateToSelectPaymentTarget(address);
      }, 2000);
    } catch (e) {
      this.error = '';
      if (e instanceof ChannelOpenFailed) {
        this.error = this.$t('open-channel.error.open-failed') as string;
      } else if (e instanceof ChannelDepositFailed) {
        this.error = this.$t('open-channel.error.deposit-failed') as string;
      } else {
        this.error = e.message;
      }

      this.done = false;
      this.loading = false;
    }
  }

  async created() {
    this.deposit = getAmount(this.$route.query.deposit);

    this.doneStep = (this.$t(
      'open-channel.steps.done'
    ) as any) as StepDescription;
    const { token: address, partner } = this.$route.params;

    if (!AddressUtils.checkAddressChecksum(address)) {
      this.navigateToHome();
      return;
    }

    await this.$raiden.fetchTokenData([address]);

    if (typeof this.token.decimals !== 'number') {
      this.navigateToHome();
    }

    if (!AddressUtils.checkAddressChecksum(partner)) {
      this.navigateToTokenSelect();
      return;
    } else {
      this.partner = partner;
    }
  }
}
</script>

<style scoped lang="scss">
.open-channel {
  height: 100%;
  width: 100%;
}

.open-channel__hub {
  max-height: 30px;
}

.open-channel__hub__label {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  font-weight: bold;
  line-height: 19px;
  text-transform: uppercase;
}

.open-channel__hub__address {
  color: #ffffff;
  font-family: Roboto, sans-serif;
  font-size: 16px;
  line-height: 20px;
  overflow-x: hidden;
  text-overflow: ellipsis;
}
</style>
