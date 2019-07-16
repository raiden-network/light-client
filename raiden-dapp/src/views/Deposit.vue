<template>
  <div class="content-host">
    <v-form v-model="valid" autocomplete="off">
      <v-layout align-center justify-center row>
        <v-flex xs10>
          <amount-input v-model="deposit" :token="token" limit></amount-input>
        </v-flex>
      </v-layout>

      <divider></divider>

      <token-information :token="token"></token-information>

      <divider></divider>

      <v-layout align-center justify-center row class="hub-information">
        <v-flex xs2 class="information">
          <div class="information-label text-xs-left">Hub</div>
        </v-flex>
        <v-flex xs8>
          <div class="information-description text-xs-left">{{ partner }}</div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center class="section">
        <v-flex xs10 class="text-xs-center">
          <v-btn
            id="open-channel"
            class="text-capitalize confirm-button"
            depressed
            :disabled="!valid"
            :loading="loading"
            large
            @click="openChannel()"
          >
            Make Deposit
          </v-btn>
        </v-flex>
      </v-layout>
    </v-form>
    <progress-overlay
      :display="loading"
      :steps="steps"
      :done-step="doneStep"
      :current="current"
      :done="done"
    ></progress-overlay>
    <error-screen
      title="Something went wrong"
      :description="error"
      button-label="Dismiss"
      @dismiss="error = ''"
    ></error-screen>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import AmountInput from '../components/AmountInput.vue';
import {
  ChannelDepositFailed,
  ChannelOpenFailed
} from '@/services/raiden-service';
import { StepDescription, Token, TokenPlaceholder } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import ProgressOverlay from '@/components/ProgressOverlay.vue';
import { Zero } from 'ethers/constants';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import { Route } from 'vue-router';
import ErrorScreen from '@/components/ErrorScreen.vue';
import Divider from '@/views/Divider.vue';
import TokenInformation from '@/views/TokenInformation.vue';

@Component({
  components: {
    TokenInformation,
    Divider,
    ErrorScreen,
    ProgressOverlay,
    AmountInput
  }
})
export default class Deposit extends Mixins(NavigationMixin) {
  partner: string = '';
  token: Token = TokenPlaceholder;

  deposit: string = '0.00';

  valid: boolean = false;
  loading: boolean = false;
  error: string = '';

  steps: StepDescription[] = [];

  protected readonly allSteps: StepDescription[] = [
    {
      label: 'Open',
      title: 'Opening a new Channel',
      description:
        'Please do not close the browser and confirm the transaction with MetaMask.'
    },
    {
      label: 'Transfer',
      title: 'Transferring tokens to the network and deposit into the channel',
      description:
        'Please do not close the browser and confirm two (2) transactions with MetaMask.'
    },
    {
      label: 'Deposit',
      title: 'Not implemented - split title above, when done',
      description: 'Not implemented - split description above, when done'
    }
  ];

  readonly doneStep: StepDescription = {
    label: 'Done',
    title: 'New Channel opened',
    description:
      'A new channel has been opened successfully.<br/>You may now select a payment target.'
  };
  current = 0;
  done = false;

  beforeRouteLeave(to: Route, from: Route, next: any) {
    if (!this.loading) {
      next();
    } else {
      if (
        window.confirm(
          'Channel opening is in progress, are you sure you want to leave?'
        )
      ) {
        next();
      } else {
        next(false);
      }
    }
  }

  async openChannel() {
    const token = this.token;
    const depositAmount = BalanceUtils.parse(this.deposit, token.decimals);

    if (depositAmount.eq(Zero)) {
      this.steps = [this.allSteps[0]];
    } else {
      this.steps = this.allSteps;
    }

    this.loading = true;

    try {
      await this.$raiden.openChannel(
        token.address,
        this.partner,
        depositAmount,
        progress => (this.current = progress.current - 1)
      );

      this.done = true;
      setTimeout(() => {
        this.loading = false;
        this.navigateToSelectPaymentTarget(this.token.address);
      }, 2000);
    } catch (e) {
      this.error = '';
      if (e instanceof ChannelOpenFailed) {
        this.error = 'Channel open failed.';
      } else if (e instanceof ChannelDepositFailed) {
        this.error = 'Could not deposit to the channel.';
      } else {
        this.error = e.message;
      }

      this.done = false;
      this.loading = false;
    }
  }

  async created() {
    const { token, partner } = this.$route.params;

    if (!AddressUtils.checkAddressChecksum(token)) {
      this.navigateToHome();
      return;
    }

    if (!AddressUtils.checkAddressChecksum(partner)) {
      this.navigateToTokenSelect();
      return;
    } else {
      this.partner = partner;
    }

    let tokenInfo = this.$store.getters.token(token);
    if (!tokenInfo) {
      tokenInfo = await this.$raiden.getToken(token);
    }

    if (!tokenInfo) {
      this.navigateToHome();
    } else {
      this.token = tokenInfo;
    }
  }
}
</script>

<style scoped lang="scss">
@import '../scss/input-screen';

.hub-information {
  max-height: 30px;
}
</style>
