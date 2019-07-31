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
          <div class="information-label text-xs-left">
            {{ $t('open-channel.hub') }}
          </div>
        </v-flex>
        <v-flex xs8>
          <div class="information-description text-xs-left">{{ partner }}</div>
        </v-flex>
      </v-layout>

      <v-layout align-center justify-center class="section">
        <v-flex xs10 class="text-xs-center">
          <v-btn
            id="open-channel"
            :disabled="!valid"
            :loading="loading"
            @click="openChannel()"
            class="text-capitalize confirm-button"
            depressed
            large
          >
            {{ $t('open-channel.open-button') }}
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
      :description="error"
      @dismiss="error = ''"
      :title="$t('open-channel.error.title')"
      :button-label="$t('open-channel.error.button')"
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
import {
  emptyDescription,
  StepDescription,
  Token,
  TokenPlaceholder
} from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import Stepper from '@/components/Stepper.vue';
import { Zero } from 'ethers/constants';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import { Route } from 'vue-router';
import ErrorScreen from '@/components/ErrorScreen.vue';
import Divider from '@/components/Divider.vue';
import TokenInformation from '@/components/TokenInformation.vue';

@Component({
  components: {
    TokenInformation,
    Divider,
    ErrorScreen,
    ProgressOverlay: Stepper,
    AmountInput
  }
})
export default class OpenChannel extends Mixins(NavigationMixin) {
  partner: string = '';
  token: Token = TokenPlaceholder;

  deposit: string = '0.00';

  valid: boolean = false;
  loading: boolean = false;
  error: string = '';

  steps: StepDescription[] = [];

  doneStep: StepDescription = emptyDescription();
  current = 0;
  done = false;

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
    const token = this.token;
    const depositAmount = BalanceUtils.parse(this.deposit, token.decimals);

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
    this.doneStep = (this.$t(
      'open-channel.steps.done'
    ) as any) as StepDescription;
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
