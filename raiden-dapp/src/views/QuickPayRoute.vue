<template>
  <div class="quick-pay">
    <div v-if="token" class="quick-pay__transfer-information">
      <span class="quick-pay__transfer-information__header">
        {{ $t('quick-pay.transfer-information-labels.header') }}
      </span>

      <token-information class="quick-pay__transfer-information__token" :token="token" />

      <address-display
        class="quick-pay__transfer-information__target"
        :label="$t('quick-pay.transfer-information-labels.target-address')"
        :address="targetAddress"
        full-width
      />

      <amount-display
        class="quick-pay__transfer-information__amount"
        :label="$t('quick-pay.transfer-information-labels.token-amount')"
        :amount="tokenAmount"
        :token="token"
        exact-amount
        full-width
      />
    </div>

    <div class="quick-pay__action">
      <span v-if="actionHeader" class="quick-pay__action__header">{{ actionHeader }}</span>

      <component
        :is="actionComponent"
        #default="{ runAction, confirmButtonLabel }"
        class="quick-pay__action__component"
        :transfer-token-amount="tokenAmount"
        :payment-identifier="paymentIdentifier"
        :dialog-title="actionDialogTitle"
        :completion-delay-timeout="1500"
        show-progress-in-dialog
        @started="setActionInProgress"
        @completed="redirect"
        @failed="handleActionError"
        @dialogClosed="redirect"
      >
        <channel-action-form
          :token-address="tokenAddress"
          :partner-address="targetAddress"
          :token-amount="formattedDepositAmount"
          :minimum-token-amount="depositAmount"
          :confirm-button-label="confirmButtonLabel"
          :run-action="runAction"
          hide-token-address
          hide-partner-address
          :token-amount-editable="!tokenAmountInputHidden"
          :hide-token-amount="tokenAmountInputHidden"
          limit-to-token-balance
          sticky-button
          @inputsChanged="onActionFromInputsChanged"
        />
      </component>

      <i18n class="quick-pay__action__message" :path="actionMessagePath">
        <template #deposit>
          <amount-display :amount="depositAmountInput" :token="token" inline />
        </template>
        <template #payment>
          <amount-display :amount="tokenAmount" :token="token" inline />
        </template>
      </i18n>
    </div>

    <error-dialog v-if="errorVisible" :error="error" @dismiss="redirect" />
  </div>
</template>

<script lang="ts">
import { BigNumber, constants } from 'ethers';
import { Component, Mixins, Watch } from 'vue-property-decorator';
import { mapGetters } from 'vuex';

import type { RaidenChannel, RaidenError } from 'raiden-ts';
import { ChannelState, ErrorCodes } from 'raiden-ts';

import ActionProgressCard from '@/components/ActionProgressCard.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import ChannelActionForm from '@/components/channels/ChannelActionForm.vue';
import ChannelDepositAndTransferAction from '@/components/channels/ChannelDepositAndTransferAction.vue';
import ChannelOpenAndTransferAction from '@/components/channels/ChannelOpenAndTransferAction.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import TransferAction from '@/components/transfer/TransferAction.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import { getAddress, getAmount, getPaymentId } from '@/utils/query-params';

function isRecoverableTransferError(error: RaidenError): boolean {
  return [ErrorCodes.PFS_NO_ROUTES_FOUND, ErrorCodes.PFS_NO_ROUTES_BETWEEN_NODES].includes(
    error.message,
  );
}

@Component({
  components: {
    ActionProgressCard,
    AddressDisplay,
    AmountDisplay,
    ChannelActionForm,
    ChannelDepositAndTransferAction,
    ChannelOpenAndTransferAction,
    ErrorDialog,
    Spinner,
    TokenInformation,
    TransferAction,
  },
  computed: {
    ...mapGetters({
      getChannels: 'channels',
      getToken: 'token',
    }),
  },
})
export default class QuickPayRoute extends Mixins(NavigationMixin) {
  getChannels!: (tokenAddress: string) => RaidenChannel[];
  getToken!: (tokenAddress: string) => Token | null;

  depositAmountInput = constants.Zero;
  actionComponent:
    | typeof TransferAction
    | typeof ChannelOpenAndTransferAction
    | typeof ChannelDepositAndTransferAction = TransferAction;
  actionInProgress = false;
  actionFailed = false;
  error: Error | null = null; // Note that action errors are not set here.

  get tokenAddress(): string {
    return getAddress(this.$route.query.tokenAddress);
  }

  get token(): Token | null {
    return this.getToken(this.tokenAddress);
  }

  get targetAddress(): string {
    return getAddress(this.$route.query.targetAddress);
  }

  get tokenAmount(): BigNumber | undefined {
    const amount = getAmount(this.$route.query.amount);
    return amount ? BigNumber.from(amount) : undefined;
  }

  get depositAmount(): BigNumber {
    switch (this.actionComponent) {
      case ChannelDepositAndTransferAction:
        let amount = this.tokenAmount?.sub(
          this.directChannelWithTarget?.capacity ?? constants.Zero,
        );
        return amount?.gt(constants.Zero) ? amount : constants.Zero;
      case ChannelOpenAndTransferAction:
        return this.tokenAmount ?? constants.Zero;
      default:
        return constants.Zero;
    }
  }

  get formattedDepositAmount(): string {
    return BalanceUtils.toUnits(this.depositAmount, this.token?.decimals ?? 18);
  }

  get tokenAmountInputHidden(): boolean {
    return this.actionComponent === TransferAction;
  }

  get paymentIdentifier(): BigNumber | undefined {
    return getPaymentId(this.$route.query.identifier);
  }

  get redirectionTarget(): string {
    return this.$route.query.redirectTo as string;
  }

  get redirectionUrl(): string {
    let url = `${this.redirectionTarget}?identifier=${this.paymentIdentifier}`;
    url += this.actionFailed ? '&failed=true' : `&payerAddress=${this.$raiden.getAccount()}`;
    return url;
  }

  get anyRequiredQueryParameterInvalid(): boolean {
    return !(
      this.tokenAddress &&
      this.targetAddress &&
      this.tokenAmount &&
      this.paymentIdentifier
    );
  }

  get errorVisible(): boolean {
    return this.error != null && !this.actionInProgress && !this.actionFailed;
  }

  get directChannelWithTarget(): RaidenChannel | undefined {
    const channels = this.getChannels(this.tokenAddress);
    return channels.filter(
      (channel) => channel.partner === this.targetAddress && channel.state === ChannelState.open,
    )[0];
  }

  get directChannelHasEnoughCapacity(): boolean {
    return !!this.directChannelWithTarget?.capacity.gte(this.tokenAmount ?? constants.MaxInt256);
  }

  get hasAnyChannelWithEnoughCapacity(): boolean {
    const channels = this.getChannels(this.tokenAddress);
    const channelsWithEnoughCapacity = channels.filter((channel) => {
      return (
        channel.state === ChannelState.open &&
        channel.capacity.gte(this.tokenAmount ?? constants.MaxUint256)
      );
    });
    return channelsWithEnoughCapacity.length > 0;
  }

  get actionHeader(): string {
    switch (this.actionComponent) {
      case TransferAction:
        return ''; // Empty on purpose. No header for this case.
      case ChannelDepositAndTransferAction:
        return this.$t('quick-pay.action-titles.channel-deposit') as string;
      case ChannelOpenAndTransferAction:
        return this.$t('quick-pay.action-titles.channel-open') as string;
      default:
        return ''; // Necessary for TypeScript
    }
  }

  get actionDialogTitle(): string {
    switch (this.actionComponent) {
      case TransferAction:
        return ''; // Empty on purpose. No title for this case.
      case ChannelDepositAndTransferAction:
        return this.$t('quick-pay.action-titles.channel-deposit-and-transfer') as string;
      case ChannelOpenAndTransferAction:
        return this.$t('quick-pay.action-titles.channel-open-and-transfer') as string;
      default:
        return ''; // Necessary for TypeScript
    }
  }

  get actionMessagePath(): string {
    switch (this.actionComponent) {
      case TransferAction:
        return 'quick-pay.action-messages.transfer';
      case ChannelDepositAndTransferAction:
        return 'quick-pay.action-messages.channel-deposit-and-transfer';
      case ChannelOpenAndTransferAction:
        return 'quick-pay.action-messages.channel-open-and-transfer';
      default:
        return ''; // Necessary for TypeScript
    }
  }

  @Watch('$route.query', { immediate: true })
  onRouteQueryChanged(): void {
    if (this.anyRequiredQueryParameterInvalid) {
      this.error = new Error(this.$t('quick-pay.invalid-parameter-error') as string);
    } else {
      this.error = null;
      this.decideOnActionComponent();
    }
  }

  onActionFromInputsChanged(event: { tokenAmount: string }): void {
    this.depositAmountInput = BalanceUtils.parse(event.tokenAmount, this.token?.decimals ?? 18);
  }

  setActionInProgress(): void {
    this.actionInProgress = true;
  }

  decideOnActionComponent(): void {
    this.actionComponent = this.hasAnyChannelWithEnoughCapacity
      ? TransferAction
      : this.directChannelWithTarget
      ? ChannelDepositAndTransferAction
      : ChannelOpenAndTransferAction;
  }

  decideToDepositOrOpenChannel(): void {
    this.actionComponent = this.directChannelWithTarget
      ? ChannelDepositAndTransferAction
      : ChannelOpenAndTransferAction;
  }

  async handleActionError(error: RaidenError): Promise<void> {
    this.actionInProgress = false;

    if (isRecoverableTransferError(error)) {
      this.decideToDepositOrOpenChannel();
    } else {
      this.actionFailed = true;
    }
  }

  async redirect(): Promise<void> {
    if (this.redirectionTarget) {
      // Save getter into variable to preserve it over the automatic unloading
      // which happens when the Raiden service disconnects.
      const url = this.redirectionUrl;
      await this.$raiden.disconnect();
      window.location.replace(url);
    } else {
      this.navigateToTransfer(this.tokenAddress);
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';

.quick-pay {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: 20px;

  &__initial-transfer-progress {
    margin: auto !important;
  }

  &__transfer-information,
  &__action {
    background-color: $transfer-screen-bg-color;
    border-radius: 15px;
    margin: 0 auto 20px;
    padding: 20px;
    width: 100%;

    @include respond-to(handhelds) {
      padding: 15px 10px;
    }

    &__header {
      font-size: 18px;
    }
  }

  &__transfer-information {
    &__token,
    &__target,
    &__amount {
      height: 48px;
      margin: 10px 0;
      padding: 0 22px 0 16px;
      border-radius: 8px;
      background-color: $input-background;
    }
  }
}
</style>
