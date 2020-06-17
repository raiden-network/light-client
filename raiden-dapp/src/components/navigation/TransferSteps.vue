<template>
  <v-container class="transfer-steps__container">
    <v-row>
      <v-stepper v-model="step" alt-labels class="transfer-steps fill-height">
        <v-stepper-header class="transfer-steps__header">
          <v-stepper-step
            :complete="step > 1"
            :class="{ active: step >= 1, skipped: pfsSelectionSkipped }"
            :complete-icon="pfsSelectionSkipped ? 'mdi-redo' : 'mdi-check'"
            step
            class="transfer-steps__step"
          >
            {{ this.$t('transfer.steps.request-route.title') }}
          </v-stepper-step>

          <v-divider
            :class="{
              active: step >= 2,
              skipped: pfsSelectionSkipped || routeSelectionSkipped
            }"
            class="transfer-steps__divider"
          ></v-divider>

          <v-stepper-step
            :complete="step > 2"
            :class="{
              active: step >= 2,
              skipped: pfsSelectionSkipped || routeSelectionSkipped
            }"
            :complete-icon="routeSelectionSkipped ? 'mdi-redo' : 'mdi-check'"
            step
            class="transfer-steps__step"
          >
            {{ this.$t('transfer.steps.select-route.title') }}
          </v-stepper-step>

          <v-divider
            :class="{ active: step >= 3, skipped: routeSelectionSkipped }"
            class="transfer-steps__divider"
          ></v-divider>

          <v-stepper-step
            :complete="step > 3"
            :class="{ active: step >= 3 }"
            step
            class="transfer-steps__step"
          >
            {{ this.$t('transfer.steps.confirm-transfer.title') }}
          </v-stepper-step>
        </v-stepper-header>

        <v-stepper-items>
          <v-stepper-content step="1">
            <v-row
              justify="center"
              align-content="center"
              no-gutters
              class="udc-balance__container"
            >
              <v-col cols="10">
                <span
                  class="udc-balance__amount"
                  :class="{
                    'low-balance':
                      selectedPfs !== null &&
                      !udcCapacity.gte(selectedPfs.price)
                  }"
                >
                  <amount-display
                    exact-amount
                    :amount="udcCapacity"
                    :token="udcToken"
                  />
                </span>
                <v-tooltip bottom>
                  <template #activator="{ on }">
                    <v-btn
                      text
                      icon
                      x-large
                      class="udc-balance__deposit"
                      @click="showUdcDeposit = true"
                      v-on="on"
                    >
                      <v-icon color="primary">play_for_work</v-icon>
                    </v-btn>
                  </template>
                  <span>
                    {{
                      $t(
                        mainnet
                          ? 'transfer.steps.request-route.tooltip-main'
                          : 'transfer.steps.request-route.tooltip',
                        {
                          token: udcToken.symbol
                        }
                      )
                    }}
                  </span>
                </v-tooltip>
                <udc-deposit-dialog
                  :visible="showUdcDeposit"
                  @cancel="showUdcDeposit = false"
                  @done="mintDone()"
                />
              </v-col>
            </v-row>
            <v-row justify="center" no-gutters class="udc-balance__container">
              <v-col cols="10">
                <span
                  v-if="
                    selectedPfs !== null && !udcCapacity.gte(selectedPfs.price)
                  "
                  class="udc-balance__description low-balance"
                >
                  {{
                    $t(
                      'transfer.steps.request-route.udc-description-low-balance',
                      { token: udcToken.symbol }
                    )
                  }}
                </span>
                <span v-else class="udc-balance__description">
                  {{ $t('transfer.steps.request-route.udc-description') }}
                </span>
              </v-col>
            </v-row>
            <v-row justify="center" class="transfer-steps__step__content">
              <v-col cols="12" sm="10">
                <pathfinding-services
                  v-if="step === 1"
                  @select="setPFS($event)"
                ></pathfinding-services>
              </v-col>
            </v-row>
          </v-stepper-content>

          <v-stepper-content step="2">
            <v-row justify="center" class="transfer-steps__step__content">
              <v-col cols="12" sm="10">
                <find-routes
                  v-if="step === 2"
                  :token="token"
                  :routes="routes"
                  :pfs-url="selectedPfs.url"
                  @select="setRoute($event)"
                ></find-routes>
              </v-col>
            </v-row>
          </v-stepper-content>

          <v-stepper-content step="3">
            <v-row v-if="step === 3 && !processingTransfer" justify="center">
              <v-col cols="12" sm="10">
                <h1>{{ $t('transfer.steps.summary.headline') }}</h1>
                <transfer-summary :transfer="transferSummary" />
              </v-col>
            </v-row>
          </v-stepper-content>
        </v-stepper-items>
      </v-stepper>
    </v-row>

    <pfs-fees-dialog
      :visible="pfsFeesConfirmed && step === 1"
      :pfs-fees-paid="pfsFeesPaid"
      :free-pfs="freePfs"
    ></pfs-fees-dialog>

    <transfer-progress-dialog
      :visible="processingTransfer"
      :in-progress="!transferDone"
      :error="error"
      :identifier="paymentId"
      @dismiss="dismissProgress(0)"
    ></transfer-progress-dialog>

    <error-dialog
      v-if="!processingTransfer"
      :error="error"
      @dismiss="navigateToSelectTransferTarget(token.address)"
    ></error-dialog>

    <action-button
      :enabled="continueBtnEnabled"
      :text="callToActionText"
      sticky
      arrow
      @click="handleStep()"
    ></action-button>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { RaidenPFS, RaidenError } from 'raiden-ts';
import { BigNumber, bigNumberify } from 'ethers/utils';

import { BalanceUtils } from '@/utils/balance-utils';
import { Token, Route, Transfer } from '@/model/types';
import NavigationMixin from '@/mixins/navigation-mixin';
import BlockieMixin from '@/mixins/blockie-mixin';
import PathfindingServices from '@/components/transfer/PathfindingServices.vue';
import FindRoutes from '@/components/transfer/FindRoutes.vue';
import ActionButton from '@/components/ActionButton.vue';
import TransferSummary from '@/components/transfer/TransferSummary.vue';
import Spinner from '@/components/icons/Spinner.vue';
import UdcDepositDialog from '@/components/dialogs/UdcDepositDialog.vue';
import Checkmark from '@/components/icons/Checkmark.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import { Zero } from 'ethers/constants';
import { getAddress, getAmount } from '@/utils/query-params';
import AddressUtils from '@/utils/address-utils';
import Filter from '@/filters';
import TransferProgressDialog from '@/components/dialogs/TransferProgressDialog.vue';
import PfsFeesDialog from '@/components/dialogs/PfsFeesDialog.vue';
import { mapGetters } from 'vuex';

@Component({
  components: {
    TransferProgressDialog,
    PathfindingServices,
    ActionButton,
    FindRoutes,
    Spinner,
    ErrorDialog,
    Checkmark,
    UdcDepositDialog,
    TransferSummary,
    PfsFeesDialog,
    AmountDisplay
  },
  computed: {
    ...mapGetters(['mainnet', 'udcToken'])
  }
})
export default class TransferSteps extends Mixins(
  BlockieMixin,
  NavigationMixin
) {
  step: number = 1;
  selectedPfs: RaidenPFS | null = null;
  selectedRoute: Route | null = null;
  routes: Route[] = [];
  pfsFeesConfirmed: boolean = false;
  pfsFeesPaid: boolean = false;
  pfsSelectionSkipped: boolean = false;
  routeSelectionSkipped: boolean = false;
  paymentId: BigNumber = bigNumberify(Date.now());
  freePfs: boolean = false;
  showUdcDeposit: boolean = false;
  mediationFeesConfirmed: boolean = false;
  processingTransfer: boolean = false;
  transferDone: boolean = false;
  error: Error | RaidenError | null = null;
  udcCapacity: BigNumber = Zero;
  udcToken!: Token;

  amount: string = '';
  target: string = '';

  mainnet!: boolean;

  get transferSummary(): Transfer {
    return {
      pfsAddress: this.selectedPfs?.url as string,
      serviceFee: this.selectedPfs?.price as BigNumber,
      serviceToken: this.udcToken,
      mediationFee: this.selectedRoute?.fee as BigNumber,
      target: this.target,
      hops: this.selectedRoute?.hops,
      transferAmount: BalanceUtils.parse(this.amount, this.token.decimals!),
      transferToken: this.token,
      transferTotal: this.totalAmount,
      paymentId: this.paymentId
    } as Transfer;
  }

  get callToActionText() {
    const amountLocalized = `transfer.steps.call-to-action.${this.step}.amount`;
    if (this.step === 1 && this.selectedPfs) {
      return this.$t(amountLocalized, {
        amount: Filter.displayFormat(
          this.selectedPfs.price as BigNumber,
          this.udcToken.decimals
        ),
        symbol: this.udcToken.symbol
      });
    }

    if (this.step === 2 && this.selectedRoute) {
      return this.$t(amountLocalized, {
        amount: this.selectedRoute?.fee
          ? Filter.displayFormat(
              this.selectedRoute.fee as BigNumber,
              this.token.decimals
            )
          : '',
        symbol: this.token.symbol
      });
    }

    if (this.step === 3) {
      return this.$t(amountLocalized, {
        amount: Filter.displayFormat(this.totalAmount, this.token.decimals),
        symbol: this.token.symbol
      });
    }

    return this.$t(`transfer.steps.call-to-action.${this.step}.default`);
  }

  private updateUDCCapacity() {
    this.$raiden.getUDCCapacity().then(value => (this.udcCapacity = value));
  }

  async created() {
    const { amount } = this.$route.query;
    const { target } = this.$route.params;

    this.amount = getAmount(amount);
    this.target = getAddress(target);

    const { token: address } = this.$route.params;

    if (!AddressUtils.checkAddressChecksum(address)) {
      this.navigateToHome();
      return;
    }

    await this.$raiden.fetchTokenData([address]);

    if (typeof this.token.decimals !== 'number') {
      this.navigateToHome();
      return;
    }

    const directRoutes = await this.$raiden.directRoute(
      address,
      this.target,
      BalanceUtils.parse(this.amount, this.token.decimals)
    );

    if (directRoutes) {
      const [route] = directRoutes;

      this.selectedRoute = {
        key: 0,
        fee: Zero,
        displayFee: '0',
        path: [...route.path],
        hops: 0
      };

      this.step = 3;
      this.pfsSelectionSkipped = true;
      this.routeSelectionSkipped = true;
    }
  }

  mounted() {
    this.updateUDCCapacity();
  }

  mintDone() {
    this.showUdcDeposit = false;
    this.updateUDCCapacity();
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
        this.selectedPfs ?? undefined
      );
    } catch (e) {
      this.error = e;
    }

    if (fetchedRoutes) {
      this.routes = fetchedRoutes.map(
        ({ path, fee }, index: number) =>
          ({
            key: index,
            hops: path.length - 1,
            fee,
            path
          } as Route)
      );

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
        this.selectedRoute.fee.isZero();

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
    return this.$store.state.tokens[address] || ({ address } as Token);
  }

  get continueBtnEnabled() {
    if (this.step == 1) {
      return (
        this.selectedPfs !== null &&
        this.udcCapacity.gte(this.selectedPfs.price)
      );
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
    return transfer.add(this.selectedRoute!.fee);
  }

  setPFS(payload: [RaidenPFS, boolean]) {
    this.selectedPfs = null;

    if (payload) {
      const [pfs, single] = payload;
      this.selectedPfs = pfs;
      this.freePfs = bigNumberify(pfs.price).isZero();
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
    const { path, fee } = this.selectedRoute!;

    try {
      this.processingTransfer = true;
      await this.$raiden.transfer(
        address,
        this.target,
        BalanceUtils.parse(this.amount, decimals!),
        [{ path, fee }],
        this.paymentId
      );

      this.transferDone = true;
      this.dismissProgress();
    } catch (e) {
      this.error = e;
    }
  }

  private dismissProgress(delay: number = 6000) {
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
@import '../../scss/colors';
@import '../../scss/fonts';

.transfer-steps {
  background: transparent !important;
  box-shadow: none;
  width: 100%;
  position: relative;

  &__container {
    height: 100%;
  }

  &__header {
    max-width: 528px;
    margin: 0 auto;
    box-shadow: none;
  }

  &__step {
    ::v-deep {
      .v-stepper {
        &__label {
          display: block !important;
        }

        &__step {
          &__step {
            background: transparent !important;
            border: 2px solid $secondary-text-color !important;
          }
        }
      }
    }

    &__content {
      margin-top: 45px;
    }

    &.active {
      ::v-deep {
        .v-stepper {
          &__step {
            &__step {
              border-color: $primary-color !important;
              background: $primary-color !important;
            }
          }

          &__label {
            color: $primary-color;
            font-weight: bold;
          }
        }
      }

      &.skipped {
        ::v-deep {
          .v-stepper {
            &__step {
              &__step {
                border-color: $secondary-text-color !important;
                background: $secondary-text-color !important;
              }
            }

            &__label {
              color: $secondary-text-color;
              font-weight: bold;
            }
          }
        }
      }
    }
  }

  &__divider {
    border: 1px solid #646464 !important;
    margin: 35px -77px 0 !important;
    &.active {
      border-color: $primary-color !important;

      &.skipped {
        border-color: $secondary-text-color !important;
      }
    }
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
    &__spinner {
      margin: 3rem 0;
    }
  }

  .udc-balance {
    &__container {
      text-align: center;
    }

    &__amount {
      font-size: 24px;
      font-weight: bold;
      font-family: $main-font;
      color: $color-white;
      vertical-align: middle;

      &.low-balance {
        color: $error-color;
      }
    }

    &__description {
      font-size: 16px;
      font-family: $main-font;
      color: $secondary-text-color;

      &.low-balance {
        color: $error-color;
      }
    }

    &__deposit {
      vertical-align: middle;
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
