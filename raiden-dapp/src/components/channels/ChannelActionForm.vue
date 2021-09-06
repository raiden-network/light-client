<template>
  <div data-cy="channel-action-form">
    <v-form
      v-model="inputsAreValid"
      class="channel-action-form"
      autocomplete="off"
      @submit.prevent="submit"
    >
      <template v-if="!hideTokenAddress">
        <address-input
          v-if="tokenAddressEditable"
          v-model="tokenAddressInput"
          class="channel-action-form__token-address channel-action-form__editable-input"
          :value="tokenAddressInput"
        />

        <div
          v-else
          class="channel-action-form__token-address channel-action-form__fixed-input-wrapper"
        >
          <token-information :token="token" />
        </div>
      </template>

      <template v-if="!hidePartnerAddress">
        <address-input
          v-if="partnerAddressEditable"
          v-model="partnerAddressInput"
          class="channel-action-form__partner-address channel-action-form__editable-input"
          :value="partnerAddressInput"
          :restricted="restrictedPartnerAddresses"
          restricted-error-message="channel-action-form.restricted-partner-address-error"
          :exclude="excludedPartnerAddresses"
          exclude-error-message="channel-action-form.exclude-partner-address-error"
          :autofocus="partnerAddressInputFocused"
        />

        <div
          v-else
          class="channel-action-form__partner-address channel-action-form__fixed-input-wrapper"
        >
          <address-display
            :label="$t('channel-action-form.partner')"
            :address="partnerAddress"
            full-width
          />
        </div>
      </template>

      <template v-if="!hideTokenAmount">
        <amount-input
          v-if="tokenAmountEditable"
          v-model="tokenAmountInput"
          class="channel-action-form__token-amount channel-action-form__editable-input"
          data-cy="channel-action-form__token-amount__input"
          :token="token"
          :placeholder="$t('channel-action-form.amount')"
          :max="tokenAmountLimit"
          :limit="!!tokenAmountLimit"
          :autofocus="tokenAmountInputFocused"
        />

        <div
          v-else
          class="channel-action-form__token-amount channel-action-form__fixed-input-wrapper"
        >
          <amount-display
            :label="$t('channel-action-form.amount')"
            :amount="tokenAmount"
            :token="token"
            exact-amount
            full-width
          />
        </div>
      </template>

      <action-button
        data-cy="channel-action-form__button"
        :text="confirmButtonLabel"
        :enabled="inputsAreValid"
        :sticky="stickyButton"
      />
    </v-form>
  </div>
</template>

<script lang="ts">
import { BigNumber } from 'ethers';
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import { mapGetters } from 'vuex';

import type { RaidenChannel } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';
import AddressInput from '@/components/AddressInput.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import AmountInput from '@/components/AmountInput.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import type { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';

@Component({
  components: {
    ActionButton,
    AddressDisplay,
    AddressInput,
    AmountDisplay,
    AmountInput,
    TokenInformation,
  },
  computed: {
    ...mapGetters({
      getToken: 'token',
      getChannels: 'channels',
    }),
  },
})
export default class ChannelActionForm extends Vue {
  @Prop({ type: String, default: '' })
  readonly tokenAddress!: string;

  @Prop({ type: Boolean, default: false })
  readonly hideTokenAddress!: boolean;

  // Future prop when we get a token input (dropdown)
  // @Prop({ required: false, type: Boolean, default: false })
  readonly tokenAddressEditable = false;

  @Prop({ type: String, default: '' })
  readonly partnerAddress!: string;

  @Prop({ type: Boolean, default: false })
  readonly hidePartnerAddress!: boolean;

  @Prop({ type: Boolean, default: false })
  readonly partnerAddressEditable!: boolean;

  @Prop({ type: Boolean, default: false })
  readonly restrictToChannelPartners!: boolean;

  @Prop({ type: Boolean, default: false })
  readonly excludeChannelPartners!: boolean;

  @Prop({ type: String, default: '' })
  readonly tokenAmount!: string;

  @Prop({ type: Boolean, default: false })
  readonly tokenAmountEditable!: boolean;

  @Prop({ type: Boolean, default: false })
  readonly limitToTokenBalance!: boolean;

  @Prop({ type: Boolean, default: false })
  readonly limitToChannelWithdrawable!: boolean;

  @Prop({ type: Boolean, default: false })
  readonly hideTokenAmount!: boolean;

  @Prop({ type: String, required: true })
  readonly confirmButtonLabel!: string;

  @Prop({ type: Boolean, default: false })
  readonly stickyButton!: boolean;

  @Prop({ required: true })
  readonly runAction!: (options: unknown) => Promise<void>;

  getToken!: (address: string) => Token;
  getChannels!: (address: string) => RaidenChannel[];

  tokenAddressInput = '';
  partnerAddressInput = '';
  tokenAmountInput = '';
  inputsAreValid = false;

  @Watch('tokenAddress', { immediate: true })
  async onTokenAddressChange(tokenAddress: string): Promise<void> {
    // TODO: This needs to be extended to also update if the user
    // selects/changes the token when the token address becomes editable.
    this.tokenAddressInput = tokenAddress;
    await this.$raiden.fetchAndUpdateTokenData([tokenAddress]);
    await this.$raiden.monitorToken(tokenAddress);
  }

  @Watch('partnerAddress', { immediate: true })
  onPartnerAddressChange(partnerAddress: string): void {
    this.partnerAddressInput = partnerAddress;
  }

  @Watch('tokenAmount', { immediate: true })
  onTokenAmountChange(tokenAmount: string): void {
    this.tokenAmountInput = tokenAmount;
  }

  get token(): Token {
    return this.getToken(this.tokenAddressInput);
  }

  get tokenAddressInputFocused(): boolean {
    return this.tokenAddressEditable;
  }

  get partnerAddressInputFocused(): boolean {
    return !this.tokenAddressInputFocused && this.partnerAddressEditable;
  }

  get tokenAmountInputFocused(): boolean {
    return !this.tokenAddressInputFocused && !this.partnerAddressInputFocused && this.tokenAmountEditable;
  }

  get channelPartnerAddresses(): Array<string> | undefined {
    const channels = this.getChannels(this.tokenAddressInput);
    return channels.map((channel) => channel.partner);
  }

  get restrictedPartnerAddresses(): Array<string> | undefined {
    if (this.restrictToChannelPartners) {
      return this.channelPartnerAddresses;
    }
  }

  get excludedPartnerAddresses(): Array<string> | undefined {
    if (this.excludeChannelPartners) {
      return this.channelPartnerAddresses;
    }
  }

  get tokenAmountLimit(): BigNumber | undefined {
    if (this.limitToTokenBalance) {
      return BigNumber.from(this.token.balance);
    } else if (this.limitToChannelWithdrawable) {
      const channels = this.getChannels(this.tokenAddressInput);
      const channelWithPartner = channels.filter(
        (channel) => channel.partner == this.partnerAddressInput,
      )[0];
      return channelWithPartner?.ownWithdrawable;
    }
  }

  get parsedTokenAmount(): BigNumber {
    return BalanceUtils.parse(this.tokenAmountInput, this.token.decimals!);
  }

  async submit(): Promise<void> {
    if (!this.inputsAreValid) {
      return;
    }

    await this.runAction({
      tokenAddress: this.tokenAddressInput,
      partnerAddress: this.partnerAddressInput,
      tokenAmount: this.parsedTokenAmount,
    });
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';

.channel-action-form {
  display: flex;
  flex-direction: column;
  align-items: center;

  &__fixed-input-wrapper {
    display: flex;
    align-items: center;
    width: 100%;
    height: 48px;
    margin: 10px 0;
    padding: 0 22px 0 16px;
    border-radius: 8px;
    background-color: $transfer-screen-bg-color;
  }

  &__editable-input {
    width: 100%;

    // Avoid jumping due to validation messages
    min-height: 110px;
  }
}
</style>
