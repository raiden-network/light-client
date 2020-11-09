<template>
  <v-form
    v-model="valid"
    autocomplete="off"
    data-cy="open_channel"
    class="open-channel"
    @submit.prevent="openChannel()"
  >
    <v-row align="center" justify="center">
      <v-col cols="10">
        <amount-input
          v-model="deposit"
          :token="token"
          :max="token.balance"
          :placeholder="$t('transfer.amount-placeholder')"
          limit
        ></amount-input>
      </v-col>
    </v-row>

    <divider></divider>

    <token-information :token="token"></token-information>

    <divider></divider>

    <v-row align="center" justify="center" no-gutters class="open-channel__hub">
      <v-col cols="2" class="open-channel__hub__label text-left">
        {{ $t('open-channel.hub') }}
      </v-col>
      <v-col cols="8" class="open-channel__hub__address text-left">
        <address-display :address="partner" />
      </v-col>
    </v-row>

    <action-button
      data-cy="open_channel_button"
      class="open-channel__button"
      :enabled="valid"
      :text="$t('open-channel.open-button')"
    ></action-button>

    <open-channel-dialog
      :visible="loading"
      :steps="steps"
      :current="current"
      :done="done"
      :done-step="doneStep"
      @cancel="dismiss()"
    ></open-channel-dialog>

    <error-dialog :error="error" @dismiss="error = null" />
  </v-form>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { constants } from 'ethers';
import { Route, NavigationGuardNext } from 'vue-router';
import { mapGetters } from 'vuex';
import { LocaleMessageObject } from 'vue-i18n';
import AmountInput from '@/components/AmountInput.vue';
import { emptyDescription, StepDescription, Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import Divider from '@/components/Divider.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';
import ActionButton from '@/components/ActionButton.vue';
import { getAmount } from '@/utils/query-params';
import OpenChannelDialog from '@/components/dialogs/OpenChannelDialog.vue';
import { RaidenError } from 'raiden-ts';

@Component({
  components: {
    TokenInformation,
    Divider,
    ErrorDialog,
    ActionButton,
    AmountInput,
    AddressDisplay,
    OpenChannelDialog,
  },
  computed: {
    ...mapGetters({
      getToken: 'token',
    }),
  },
})
export default class OpenChannelRoute extends Mixins(NavigationMixin) {
  partner = '';
  getToken!: (address: string) => Token;

  deposit = '0.00';

  valid = false;
  loading = false;
  error: Error | RaidenError | null = null;

  steps: StepDescription[] = [];

  doneStep: StepDescription = emptyDescription();
  current = 0;
  done = false;

  dismiss() {
    this.loading = false;
  }

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.getToken(address) || ({ address } as Token);
  }

  beforeRouteLeave(to: Route, from: Route, next: NavigationGuardNext) {
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

  getStepDescription(step: string): StepDescription {
    const translation = this.$t(`open-channel.steps.${step}`) as LocaleMessageObject;
    return {
      label: translation.label,
      title: translation.title,
      description: translation.description,
    } as StepDescription;
  }

  async openChannel() {
    const { address, decimals } = this.token;
    const depositAmount = BalanceUtils.parse(this.deposit, decimals!);

    if (depositAmount.eq(constants.Zero)) {
      this.steps = [this.getStepDescription('open')];
    } else {
      this.steps = [
        this.getStepDescription('open'),
        this.getStepDescription('transfer'),
        this.getStepDescription('deposit'),
      ];
    }

    this.loading = true;

    try {
      await this.$raiden.openChannel(
        address,
        this.partner,
        depositAmount,
        (progress) => (this.current = progress.current - 1),
      );

      this.done = true;
      setTimeout(() => {
        this.loading = false;
        this.navigateToSelectTransferTarget(address);
      }, 2000);
    } catch (e) {
      this.error = e;
      this.done = false;
      this.loading = false;
    }
  }

  async created() {
    this.deposit = getAmount(this.$route.query.deposit);

    this.doneStep = this.getStepDescription('done');
    const { token: address, partner } = this.$route.params;

    if (!AddressUtils.checkAddressChecksum(address)) {
      this.navigateToHome();
      return;
    }

    await this.$raiden.fetchTokenData([address]);

    if (typeof this.token.decimals !== 'number') {
      this.navigateToHome();
    }

    await this.$raiden.monitorToken(address);

    if (this.token.decimals === 0 && this.deposit.indexOf('.') > -1) {
      this.deposit = this.deposit.split('.')[0];
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
@import '@/scss/fonts';

.open-channel {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;

  &__hub {
    max-height: 30px;
    &__label {
      color: #ffffff;
      font-family: $main-font;
      font-size: 16px;
      font-weight: bold;
      line-height: 19px;
      text-transform: uppercase;
    }

    &__address {
      color: #ffffff;
      font-family: $main-font;
      font-size: 16px;
      line-height: 20px;
      overflow-x: hidden;
      text-overflow: ellipsis;
    }
  }
}
</style>