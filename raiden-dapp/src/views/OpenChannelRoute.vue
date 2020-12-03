<template>
  <v-form
    v-model="valid"
    autocomplete="off"
    data-cy="open_channel"
    class="open-channel"
    @submit.prevent="openChannel()"
  >
    <div class="open-channel__amount">
      <amount-input
        v-model="deposit"
        :token="token"
        :max="token.balance"
        :placeholder="$t('transfer.amount-placeholder')"
        limit
      />
    </div>
    <divider />
    <div class="open-channel__token-information">
      <token-information :token="token" />
    </div>
    <div class="open-channel__hub">
      <span class="open-channel__hub__label">
        {{ $t('open-channel.hub') }}
      </span>
      <div class="open-channel__hub__address">
        <address-display :address="partner" />
      </div>
    </div>
    <action-button
      data-cy="open_channel_button"
      class="open-channel__button"
      :enabled="valid"
      :text="$t('open-channel.open-button')"
    />
    <open-channel-dialog
      :visible="loading"
      :steps="steps"
      :current="current"
      :done="done"
      :done-step="doneStep"
      @cancel="dismiss()"
    />
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

    await this.$raiden.fetchAndUpdateTokenData([address]);

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
.open-channel {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: 0 26px;
  width: 100%;

  &__amount {
    display: flex;
    flex-direction: column;
    height: 300px;
    justify-content: center;
  }

  &__token-information {
    display: flex;
    justify-content: flex-start;
  }

  &__hub {
    align-items: center;
    display: flex;
    margin-top: 16px;
    padding: 0 22px 0 16px;

    &__label {
      flex: 1;
    }

    &__address {
      flex: none;
    }
  }

  &__button {
    margin-top: 110px;
  }
}
</style>
