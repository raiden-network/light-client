<template>
  <div class="content-host">
    <v-form v-model="valid" autocomplete="off">
      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10>
          <div class="screen-title">Open Channel</div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10>
          <amount-input v-model="deposit" :token="token" limit></amount-input>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <div class="divider"></div>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10 class="information">
          <div class="information-label text-xs-left">Token</div>
          <div class="information-description text-xs-left">
            <span class="font-weight-medium">{{ token.symbol }}</span>
            · {{ token.name }}
          </div>
          <div class="text--secondary">
            {{ token.address }}
          </div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10 class="information">
          <div class="information-label text-xs-left">Hub</div>
          <div class="information-description text-xs-left">{{ partner }}</div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center class="section">
        <v-flex xs10 md10 lg10 class="text-xs-center">
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

@Component({
  components: { ProgressOverlay, AmountInput }
})
export default class Deposit extends Mixins(NavigationMixin) {
  partner: string = '';
  token: Token = TokenPlaceholder;

  deposit: string = '0.00';

  valid: boolean = false;
  loading: boolean = false;
  snackbar: boolean = false;
  error: string = '';

  steps: StepDescription[] = [];

  protected readonly allSteps: StepDescription[] = [
    {
      title: 'Opening a new Channel',
      description:
        'Please do not close the browser and confirm the transaction with MetaMask.'
    },
    {
      title: 'Transferring tokens to the network and deposit into the channel',
      description:
        'Please do not close the browser and confirm two (2) transactions with MetaMask.'
    },
    {
      title: 'Not implemented - split title above, when done',
      description: 'Not implemented - split description above, when done'
    }
  ];

  readonly doneStep: StepDescription = {
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

      this.snackbar = true;
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
</style>
