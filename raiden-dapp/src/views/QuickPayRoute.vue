<template>
  <div class="quick-pay">
    <div v-if="token" class="quick-pay__transfer-information">
      <span class="quick-pay__transfer-information__header">
        {{ $t('quick-pay.transfer-information.header') }}
      </span>

      <token-information class="quick-pay__transfer-information__token" :token="token" />

      <address-display
        class="quick-pay__transfer-information__target"
        :label="$t('quick-pay.transfer-information.target-address')"
        :address="targetAddress"
        full-width
      />

      <amount-display
        class="quick-pay__transfer-information__amount"
        :label="$t('quick-pay.transfer-information.token-amount')"
        :amount="tokenAmount"
        :token="token"
        exact-amount
        full-width
      />

      <div v-if="mediationTransferIsPossible" class="quick-pay__transfer-information__mediation">
        <amount-display
          class="quick-pay__transfer-information__mediation__pathfinding-service-price"
          :label="$t('quick-pay.transfer-information.pathfinding-service-price')"
          :amount="pathfindingServicePrice"
          :token="serviceToken"
          exact-amount
          full-width
        >
          <spinner v-if="!pathfindingServicePrice" :size="25" :width="3" inline />
        </amount-display>

        <amount-display
          class="quick-pay__transfer-information__mediation__fees"
          label=""
          :amount="mediationFees"
          :token="token"
          exact-amount
          full-width
        >
          <button
            v-if="showFetchMediationRouteButton"
            class="quick-pay__transfer-information__mediation__button"
            :disabled="fetchMediationRouteDisabled"
            @click="fetchCheapestMediationRoute"
          >
            {{ $t('quick-pay.transfer-information.fetch-route-trigger') }}
          </button>

          <spinner v-if="fetchMediationRouteInProgress" :size="25" :width="3" inline />

          <span
            v-if="showFetchMediationRouteError"
            class="quick-pay__transfer-information__mediation__error"
          >
            {{ fetchMediationRouteError }}
          </span>
        </amount-display>
      </div>
    </div>

    <div v-if="actionComponent" class="quick-pay__action">
      <span v-if="actionHeader" class="quick-pay__action__header">{{ actionHeader }}</span>

      <component
        :is="actionComponent"
        #default="{ runAction, confirmButtonLabel }"
        class="quick-pay__action__component"
        :fixed-run-options="actionFixedRunOptions"
        :dialog-title="actionDialogTitle"
        :completion-delay-timeout="1500"
        show-progress-in-dialog
        @started="setActionInProgress"
        @failed="setActionFailed"
        @completed="redirect"
        @dialogClosed="redirect"
      >
        <channel-action-form
          :token-address="tokenAddress"
          :partner-address="targetAddress"
          :token-amount="formattedDepositAmount"
          :minimum-token-amount="depositAmount"
          :confirm-button-label="confirmButtonLabel"
          :autofocus-disabled="actionFormAutofocusDisabled"
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
import { createNamespacedHelpers, mapGetters } from 'vuex';

import type { RaidenChannel, RaidenPaths, RaidenPFS } from 'raiden-ts';
import { ChannelState } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import ChannelActionForm from '@/components/channels/ChannelActionForm.vue';
import ChannelDepositAndTransferAction from '@/components/channels/ChannelDepositAndTransferAction.vue';
import ChannelOpenAndTransferAction from '@/components/channels/ChannelOpenAndTransferAction.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import Spinner from '@/components/icons/Spinner.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import DirectTransferAction from '@/components/transfer/DirectTransferAction.vue';
import MediatedTransferAction from '@/components/transfer/MediatedTransferAction.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { Token } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import { getAddress, getAmount, getPaymentId } from '@/utils/query-params';

const { mapState: mapUserDepositContractState } = createNamespacedHelpers('userDepositContract');

@Component({
  components: {
    ActionButton,
    AddressDisplay,
    AmountDisplay,
    ChannelActionForm,
    ChannelDepositAndTransferAction,
    ChannelOpenAndTransferAction,
    ErrorDialog,
    Spinner,
    TokenInformation,
    DirectTransferAction,
    MediatedTransferAction,
  },
  computed: {
    ...mapGetters({
      getChannels: 'channels',
      getToken: 'token',
    }),
    ...mapUserDepositContractState({
      serviceToken: 'token',
    }),
  },
})
export default class QuickPayRoute extends Mixins(NavigationMixin) {
  getChannels!: (tokenAddress: string) => RaidenChannel[];
  getToken!: (tokenAddress: string) => Token | null;
  serviceToken!: Token;

  pathfindingService: RaidenPFS | null = null;
  serviceTokenCapacity = constants.Zero;
  fetchMediationRouteInProgress = false;
  fetchMediationRouteFailed = false;
  mediationRoute: RaidenPaths[number] | null = null;
  depositAmountInput = constants.Zero;
  actionComponent:
    | typeof DirectTransferAction
    | typeof MediatedTransferAction
    | typeof ChannelOpenAndTransferAction
    | typeof ChannelDepositAndTransferAction
    | null = null;
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
    return (
      this.actionComponent === null ||
      this.actionComponent === DirectTransferAction ||
      this.actionComponent === MediatedTransferAction
    );
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

  get mediationTransferIsPossible(): boolean {
    return this.hasAnyChannelWithEnoughCapacity && !this.directChannelHasEnoughCapacity;
  }

  get pathfindingServicePrice(): BigNumber | undefined {
    return this.pathfindingService?.price
      ? BigNumber.from(this.pathfindingService.price)
      : undefined;
  }

  get pathfindingServiceTooExpensive(): boolean {
    if (this.pathfindingServicePrice === undefined) {
      return false;
    } else {
      return this.pathfindingServicePrice.gt(this.serviceTokenCapacity);
    }
  }

  get showFetchMediationRouteError(): boolean {
    return this.fetchMediationRouteFailed || this.pathfindingServiceTooExpensive;
  }

  get fetchMediationRouteError(): string | undefined {
    if (this.pathfindingServiceTooExpensive) {
      return this.$t('quick-pay.transfer-information.fetch-route-error-too-expensive') as string;
    } else if (this.fetchMediationRouteFailed) {
      return this.$t('quick-pay.transfer-information.fetch-route-error-no-route') as string;
    }
  }

  get showFetchMediationRouteButton(): boolean {
    return (
      !this.mediationRoute &&
      !this.pathfindingServiceTooExpensive &&
      !this.fetchMediationRouteInProgress &&
      !this.fetchMediationRouteFailed
    );
  }

  get fetchMediationRouteDisabled(): boolean {
    return this.pathfindingService === null || this.pathfindingServiceTooExpensive;
  }

  get mediationFees(): BigNumber | undefined {
    return this.mediationRoute?.fee ? BigNumber.from(this.mediationRoute.fee) : undefined;
  }

  get actionHeader(): string {
    switch (this.actionComponent) {
      case DirectTransferAction:
      case MediatedTransferAction:
        return ''; // Empty on purpose. No header for this case.
      case ChannelDepositAndTransferAction:
        return this.$t('quick-pay.action-titles.channel-deposit') as string;
      case ChannelOpenAndTransferAction:
        return this.$t('quick-pay.action-titles.channel-open') as string;
      default:
        return ''; // Necessary for TypeScript
    }
  }

  get actionFixedRunOptions(): { [key: string]: unknown } {
    return {
      transferTokenAmount: this.tokenAmount,
      paymentIdentifier: this.paymentIdentifier,
      route: this.mediationRoute,
    };
  }

  get actionDialogTitle(): string {
    switch (this.actionComponent) {
      case DirectTransferAction:
      case MediatedTransferAction:
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
      case DirectTransferAction:
        return 'quick-pay.action-messages.direct-transfer';
      case MediatedTransferAction:
        return 'quick-pay.action-messages.mediated-transfer';
      case ChannelDepositAndTransferAction:
        return 'quick-pay.action-messages.channel-deposit-and-transfer';
      case ChannelOpenAndTransferAction:
        return 'quick-pay.action-messages.channel-open-and-transfer';
      default:
        return ''; // Necessary for TypeScript
    }
  }

  get actionFormAutofocusDisabled(): boolean {
    // In this case the it could be that the user can fetch a route for
    // a mediated transfer. In such a case the active action and its form will
    // be either the channel deposit and transfer or channel open and transfer.
    // Focusing their form in such a case it not nice as the user theoretically
    // should prefer the mediated transfer if possible.
    // In case of a direct transfer this does basically nothing.
    // In case no direct transfer nor a mediated transfer is possible, this will
    // still autofocus the respective form.
    return this.hasAnyChannelWithEnoughCapacity;
  }

  created(): void {
    this.fetchServiceTokenCapacity();
    this.fetchCheapestPathfindingService();
  }

  async fetchServiceTokenCapacity(): Promise<void> {
    this.serviceTokenCapacity = await this.$raiden.getUDCCapacity();
  }

  async fetchCheapestPathfindingService(): Promise<void> {
    const allServiceSorted = await this.$raiden.fetchServices();
    this.pathfindingService = allServiceSorted[0];
  }

  async fetchCheapestMediationRoute(): Promise<void> {
    try {
      this.fetchMediationRouteFailed = false;
      this.fetchMediationRouteInProgress = true;
      const allRoutesSorted = await this.$raiden.findRoutes(
        this.tokenAddress,
        this.targetAddress,
        this.tokenAmount!,
        this.pathfindingService!,
      );
      this.mediationRoute = allRoutesSorted[0];
    } catch (error) {
      this.fetchMediationRouteFailed = true;
    } finally {
      this.fetchMediationRouteInProgress = false;
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

  @Watch('mediationRoute')
  onMediationRouteChanged(): void {
    this.decideOnActionComponent();
  }

  onActionFromInputsChanged(event: { tokenAmount: string }): void {
    this.depositAmountInput = BalanceUtils.parse(event.tokenAmount, this.token?.decimals ?? 18);
  }

  setActionInProgress(): void {
    this.actionInProgress = true;
  }

  setActionFailed(): void {
    this.actionFailed = true;
  }

  decideOnActionComponent(): void {
    if (this.actionInProgress) {
      return;
    }

    // Note that the mediated transfer takes precedence here because the user
    // manually fetches a route. If a direct transfer is possible, the user
    // can't fetch such a route, so this case will never happen.
    this.actionComponent = this.mediationRoute
      ? MediatedTransferAction
      : this.directChannelHasEnoughCapacity
      ? DirectTransferAction
      : this.directChannelWithTarget
      ? ChannelDepositAndTransferAction
      : ChannelOpenAndTransferAction;
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
    &__amount,
    &__mediation {
      height: 48px;
      margin: 10px 0;
      padding: 0 22px 0 16px;
      border-radius: 8px;
      background-color: $input-background;
    }

    &__mediation {
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 80px;
      width: 100%;

      &__button {
        color: $primary-color;

        &:disabled {
          color: $primary-disabled-color;
        }
      }

      &__error {
        color: $error-color;
      }
    }
  }
}
</style>
