<template>
  <div id="container">
    <v-form autocomplete="off" v-model="valid">
      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10>
          <div class="screen-title">Open Channel</div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10>
          <amount-input
            :token="tokenInfo"
            v-model="deposit"
            limit
          ></amount-input>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center row>
        <div class="divider"></div>
      </v-layout>

      <v-layout align-center justify-center row>
        <v-flex xs10 md10 lg10 class="information">
          <div class="information-label text-xs-left">Token</div>
          <div class="information-description text-xs-left">{{ token }}</div>
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
            class="text-capitalize confirm-button"
            depressed
            id="open-channel"
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
import { Component, Prop, Vue } from 'vue-property-decorator';
import AmountInput from './AmountInput.vue';
import {
  ChannelDepositFailed,
  ChannelOpenFailed
} from '@/services/raiden-service';
import { StepDescription, Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import ProgressOverlay from '@/components/ProgressOverlay.vue';
import { Zero } from 'ethers/constants';

@Component({
  components: { ProgressOverlay, AmountInput }
})
export default class Deposit extends Vue {
  @Prop({ required: true })
  token!: string;
  @Prop({ required: true })
  partner!: string;
  @Prop({ required: true })
  tokenInfo!: Token;

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

  async openChannel() {
    const tokenInfo = this.tokenInfo;
    const depositAmount = BalanceUtils.parse(this.deposit, tokenInfo.decimals);

    if (depositAmount.eq(Zero)) {
      this.steps = [this.allSteps[0]];
    } else {
      this.steps = this.allSteps;
    }

    this.loading = true;

    try {
      await this.$raiden.openChannel(
        this.token,
        this.partner,
        depositAmount,
        progress => (this.current = progress.current - 1)
      );

      this.done = true;
      setTimeout(() => {
        this.loading = false;
        this.navigateToSelectPaymentTarget();
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

  private navigateToSelectPaymentTarget() {
    this.$router.push({
      name: 'send',
      params: { token: this.token }
    });
  }
}
</script>

<style scoped lang="scss">
@import '../scss/input-screen';
@import '../main';

form {
  height: 50vh;
  min-height: 500px;
  @include respond-to(handhelds) {
    height: 100%;
    min-height: 100%;
  }
}

form:first-child {
  margin-top: 20px;
  @include respond-to(handhelds) {
    margin-top: 10px;
  }
}

#container {
  height: 100%;
}
</style>
