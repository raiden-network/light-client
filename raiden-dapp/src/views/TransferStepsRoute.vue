<template>
  <div class="transfer-steps">
    <v-stepper
      v-model="step"
      max-width="450px"
      alt-labels
      class="transfer-steps__stepper"
      color="primary"
    >
      <v-stepper-header>
        <stepper-step
          :title="$t('transfer.steps.request-route.title')"
          :complete="requestRouteStepComplete"
          :active="requestRouteStepActive"
          :skipped="requestRouteStepSkipped"
        />

        <stepper-divider :active="selectRouteStepActive" :skipped="selectRouteStepSkipped" />

        <stepper-step
          :title="$t('transfer.steps.select-route.title')"
          :complete="selectRouteStepComplete"
          :active="selectRouteStepActive"
          :skipped="selectRouteStepSkipped"
        />

        <stepper-divider :active="confirmTransferStepActive" :skipped="routeSelectionSkipped" />

        <stepper-step
          :title="$t('transfer.steps.confirm-transfer.title')"
          :complete="confirmTransferStepComplete"
          :active="confirmTransferStepActive"
        />
      </v-stepper-header>

      <v-stepper-items>
        <v-stepper-content step="1">
          <udc-status
            class="my-6"
            :pfs-price="selectedPfsPrice"
            @capacityUpdate="onUdcCapacityUpdate"
          />
          <pathfinding-services v-if="step === 1" @select="setPFS($event)" />
        </v-stepper-content>

        <v-stepper-content step="2">
          <find-routes
            v-if="step === 2"
            :token="token"
            :routes="routes"
            :pfs-url="selectedPfs.url"
            @select="setRoute($event)"
          />
        </v-stepper-content>

        <v-stepper-content step="3">
          <transfer-summary :transfer="transferSummary" />
        </v-stepper-content>
      </v-stepper-items>
    </v-stepper>

    <udc-deposit-dialog
      :visible="showUdcDeposit"
      @cancel="showUdcDeposit = false"
      @done="mintDone()"
    />

    <pfs-fees-dialog
      :visible="pfsFeesConfirmed && step === 1"
      :pfs-fees-paid="pfsFeesPaid"
      :free-pfs="freePfs"
    />

    <transfer-progress-dialog
      :visible="processingTransfer"
      :in-progress="!transferDone"
      :error="error"
      :identifier="paymentId"
      @dismiss="dismissProgress(0)"
    />

    <error-dialog
      v-if="!processingTransfer"
      :error="error"
      @dismiss="navigateToSelectTransferTarget(token.address)"
    />

    <action-button
      data-cy="transfer_button"
      class="transfer__button"
      :enabled="continueBtnEnabled"
      :text="callToActionText"
      full-width
      sticky
      arrow
      @click="handleStep()"
    />
  </div>
</template>

<script lang="ts">
import { BigNumber, constants } from 'ethers';
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';

import type { RaidenError, RaidenPFS } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import PfsFeesDialog from '@/components/dialogs/PfsFeesDialog.vue';
import TransferProgressDialog from '@/components/dialogs/TransferProgressDialog.vue';
import Checkmark from '@/components/icons/Checkmark.vue';
import StepperDivider from '@/components/stepper/StepperDivider.vue';
import StepperStep from '@/components/stepper/StepperStep.vue';
import FindRoutes from '@/components/transfer/FindRoutes.vue';
import PathfindingServices from '@/components/transfer/PathfindingServices.vue';
import TransferSummary from '@/components/transfer/TransferSummary.vue';
import UdcStatus from '@/components/UdcStatus.vue';
import Filter from '@/filters';
import BlockieMixin from '@/mixins/blockie-mixin';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { Route, Token, Transfer } from '@/model/types';
import type { Tokens } from '@/types';
import AddressUtils from '@/utils/address-utils';
import { BalanceUtils } from '@/utils/balance-utils';
import { getAddress, getAmount, getPaymentId } from '@/utils/query-params';

@Component({
  components: {
    TransferProgressDialog,
    PathfindingServices,
    ActionButton,
    FindRoutes,
    ErrorDialog,
    Checkmark,
    TransferSummary,
    PfsFeesDialog,
    UdcStatus,
    StepperStep,
    StepperDivider,
  },
  computed: {
    ...mapState(['tokens']),
    ...mapState('userDepositContract', { udcToken: 'token' }),
    ...mapGetters(['mainnet']),
  },
})
export default class TransferSteps extends Mixins(BlockieMixin, NavigationMixin) {
  step = 1;
  selectedPfs: RaidenPFS | null = null;
  selectedRoute: Route | null = null;
  routes: Route[] = [];
  pfsFeesConfirmed = false;
  pfsFeesPaid = false;
  pfsSelectionSkipped = false;
  routeSelectionSkipped = false;
  paymentId: BigNumber = BigNumber.from(Date.now());
  freePfs = false;
  mediationFeesConfirmed = false;
  processingTransfer = false;
  transferDone = false;
  error: Error | RaidenError | null = null;
  udcCapacity: BigNumber = constants.Zero;
  udcToken!: Token;
  tokens!: Tokens;

  amount = '';
  target = '';

  mainnet!: boolean;

  get requestRouteStepComplete(): boolean {
    return this.step > 1;
  }

  get requestRouteStepActive(): boolean {
    return this.step >= 1;
  }

  get requestRouteStepSkipped(): boolean {
    return this.pfsSelectionSkipped;
  }

  get selectRouteStepComplete(): boolean {
    return this.step > 2;
  }

  get selectRouteStepActive(): boolean {
    return this.step >= 2;
  }

  get selectRouteStepSkipped(): boolean {
    return this.pfsSelectionSkipped || this.routeSelectionSkipped;
  }

  get confirmTransferStepComplete(): boolean {
    return this.step > 3;
  }

  get confirmTransferStepActive(): boolean {
    return this.step >= 3;
  }

  get balanceIsLow(): boolean {
    return this.selectedPfs !== null && !this.udcCapacity.gte(this.selectedPfs.price);
  }

  get transferSummary(): Transfer {
    return {
      pfsAddress: this.selectedPfs?.url as string,
      serviceFee: this.selectedPfs?.price as BigNumber,
      serviceToken: this.udcToken,
      mediationFee: this.selectedRouteFees,
      target: this.target,
      hops: this.selectedRoute?.hops,
      transferAmount: BalanceUtils.parse(this.amount, this.token.decimals!),
      transferToken: this.token,
      transferTotal: this.totalAmount,
      paymentId: this.paymentId,
    } as Transfer;
  }

  get callToActionText() {
    const amountLocalized = `transfer.steps.call-to-action.${this.step}.amount`;
    if (this.step === 1 && this.selectedPfs) {
      return this.$t(amountLocalized, {
        amount: Filter.displayFormat(this.selectedPfs.price as BigNumber, this.udcToken.decimals),
        symbol: this.udcToken.symbol,
      });
    }

    if (this.step === 2 && this.selectedRoute) {
      return this.$t(amountLocalized, {
        amount: Filter.displayFormat(this.selectedRouteFees, this.token.decimals),
        symbol: this.token.symbol,
      });
    }

    if (this.step === 3) {
      return this.$t(amountLocalized, {
        amount: Filter.displayFormat(this.totalAmount, this.token.decimals),
        symbol: this.token.symbol,
      });
    }

    return this.$t(`transfer.steps.call-to-action.${this.step}.default`);
  }

  onUdcCapacityUpdate(capacity: BigNumber): void {
    this.udcCapacity = capacity;
  }

  async created() {
    const { amount, identifier } = this.$route.query;
    const { target } = this.$route.params;

    this.amount = getAmount(amount);
    this.target = getAddress(target);
    this.paymentId = getPaymentId(identifier) || this.paymentId;

    const { token: address } = this.$route.params;

    if (!AddressUtils.checkAddressChecksum(address)) {
      this.navigateToHome();
      return;
    }

    await this.$raiden.fetchAndUpdateTokenData([address]);

    if (typeof this.token.decimals !== 'number') {
      this.navigateToHome();
      return;
    }

    const directRoutes = await this.$raiden.directRoute(
      address,
      this.target,
      BalanceUtils.parse(this.amount, this.token.decimals),
    );

    if (directRoutes) {
      const [route] = directRoutes;

      this.selectedRoute = {
        key: 0,
        displayFee: '0',
        hops: 0,
        ...route,
      };

      this.step = 3;
      this.pfsSelectionSkipped = true;
      this.routeSelectionSkipped = true;
    }
  }

  async findRoutes(): Promise<void> {
    const { address, decimals } = this.token;
    // Fetch available routes from PFS
    let fetchedRoutes;
    try {
      fetchedRoutes = await this.$raiden.findRoutes(
        address,
        this.target,
        BalanceUtils.parse(this.amount, decimals!),
        this.selectedPfs ?? undefined,
      );
    } catch (e) {
      this.error = e;
    }

    if (fetchedRoutes) {
      this.routes = fetchedRoutes.map(({ path, ...rest }, index: number) => ({
        key: index,
        ...rest,
        hops: path.length - 1,
        path,
      }));

      // Automatically select cheapest route
      const [route] = this.routes;
      if (route) {
        this.selectedRoute = route;
      }
    }
  }

  async handleStep() {
    if (this.step === 1 && this.selectedPfs && !this.pfsFeesConfirmed) {
      this.pfsFeesConfirmed = true;
      try {
        await this.findRoutes();
      } catch (e) {
        this.pfsFeesConfirmed = false;
        this.error = e;
        return;
      }

      this.pfsFeesPaid = true;

      // If we received only one route and it has zero mediation fees,
      // then head straight to the 3rd summary step
      const onlySingleFreeRoute =
        this.routes.length === 1 &&
        this.selectedRoute &&
        BigNumber.from(this.selectedRouteFees).isZero();

      if (onlySingleFreeRoute) {
        setTimeout(() => {
          this.routeSelectionSkipped = true;
          this.step = 3;
        }, 2000);
      } else {
        // We received multiple routes, let the user pick one in 2nd step
        setTimeout(() => {
          this.step = 2;
        }, 2000);
      }
    }

    if (this.step === 2 && this.selectedRoute) {
      this.mediationFeesConfirmed = true;
      this.step = 3;
      return;
    }

    if (this.step === 3 && this.selectedRoute) {
      await this.transfer();
    }
  }

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.tokens[address] || ({ address } as Token);
  }

  get continueBtnEnabled() {
    if (this.step == 1) {
      return this.selectedPfs !== null && this.udcCapacity.gte(this.selectedPfs.price);
    }

    if (this.step == 2) {
      return this.selectedRoute !== null;
    }

    if (this.step == 3) {
      return this.selectedRoute !== null && !this.processingTransfer;
    }

    return false;
  }

  get totalAmount(): BigNumber {
    const { decimals } = this.token;
    const transfer: BigNumber = BalanceUtils.parse(this.amount, decimals!);
    return transfer.add(this.selectedRouteFees);
  }

  get selectedRouteFees(): BigNumber {
    return (this.selectedRoute?.fee as BigNumber) ?? constants.Zero;
  }

  setPFS(payload: [RaidenPFS, boolean]) {
    this.selectedPfs = null;

    if (payload) {
      const [pfs, single] = payload;
      this.selectedPfs = pfs;
      this.freePfs = BigNumber.from(pfs.price).isZero();
      if (pfs && single && this.freePfs) {
        this.handleStep();
      }
    }
  }

  setRoute(route: Route) {
    this.selectedRoute = route;
  }

  async transfer() {
    const { address, decimals } = this.token;

    try {
      this.processingTransfer = true;
      await this.$raiden.transfer(
        address,
        this.target,
        BalanceUtils.parse(this.amount, decimals!),
        [this.selectedRoute!],
        this.paymentId,
      );

      this.transferDone = true;
      this.dismissProgress();
    } catch (e) {
      this.error = e;
    }
  }

  private dismissProgress(delay = 6000) {
    setTimeout(() => {
      this.error = null;
      this.processingTransfer = false;
      this.transferDone = false;
      this.navigateToSelectTransferTarget(this.token.address);
    }, delay);
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/mixins';

.transfer-steps {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  padding: 20px 60px 50px;

  @include respond-to(handhelds) {
    padding: 10px 10px 50px;
  }

  &__stepper {
    background: transparent !important;
    margin: auto;
  }

  &__processing-transfer {
    &__title {
      font-size: 36px;
      font-weight: bold;
      line-height: 38px;
      text-align: center;
    }
    &__description {
      font-size: 16px;
      line-height: 21px;
      text-align: center;
      margin-top: 2rem;
    }
  }
}

.v-dialog {
  &__content {
    &--active {
      background-color: rgba($color-white, 0.15);
      backdrop-filter: blur(4px);
    }
  }
}
</style>
