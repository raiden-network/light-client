<template>
  <v-container class="transfer-steps__container">
    <v-row>
      <v-stepper v-model="step" alt-labels class="transfer-steps fill-height">
        <v-stepper-header class="transfer-steps__header">
          <v-stepper-step
            :complete="selectedPfs !== null"
            complete-icon=""
            step=""
            class="transfer-steps__step"
            :class="{ active: step >= 1 }"
          >
            {{ this.$t('transfer.steps.request-route.title') }}
          </v-stepper-step>

          <v-divider
            class="transfer-steps__divider"
            :class="{ active: step >= 2 }"
          ></v-divider>

          <v-stepper-step
            :complete="step >= 2"
            complete-icon=""
            step=""
            class="transfer-steps__step"
            :class="{ active: step >= 2 }"
          >
            {{ this.$t('transfer.steps.select-route.title') }}
          </v-stepper-step>

          <v-divider
            class="transfer-steps__divider"
            :class="{ active: step >= 3 }"
          ></v-divider>

          <v-stepper-step
            :complete="step >= 3"
            complete-icon=""
            step=""
            class="transfer-steps__step"
            :class="{ active: step >= 3 }"
          >
            {{ this.$t('transfer.steps.confirm-transfer.title') }}
          </v-stepper-step>
        </v-stepper-header>

        <v-stepper-items>
          <v-stepper-content step="1">
            <v-row
              justify="center"
              align-content="center"
              no-gutters=""
              class="udc-balance__container"
            >
              <v-col cols="10">
                <span class="udc-balance__amount">
                  {{
                    this.$t('transfer.steps.request-route.udc-amount', {
                      amount: convertToUnits(
                        udcCapacity,
                        udcToken.decimals || 18
                      ),
                      token: udcToken.symbol || 'SVT'
                    })
                  }}
                </span>
                <v-dialog
                  v-model="showMintDeposit"
                  max-width="425"
                  class="udc-balance__dialog-container"
                >
                  <template #activator="{ on }">
                    <v-btn
                      text
                      icon
                      x-large
                      class="udc-balance__deposit"
                      @click="showMintDeposit = true"
                      v-on="on"
                    >
                      <v-icon color="primary">play_for_work</v-icon>
                    </v-btn>
                  </template>
                  <mint-deposit-dialog
                    @cancel="showMintDeposit = false"
                    @done="mintDone()"
                  />
                </v-dialog>
              </v-col>
            </v-row>
            <v-row
              justify="center"
              no-gutters=""
              class="udc-balance__container"
            >
              <v-col cols="10">
                <span class="udc-balance__description">
                  {{
                    this.$t('transfer.steps.request-route.udc-description', {
                      token: udcToken.symbol || 'SVT'
                    })
                  }}
                </span>
              </v-col>
            </v-row>
            <v-row justify="center">
              <v-col cols="10">
                <pathfinding-services
                  v-if="step === 1"
                  @select="setPFS($event)"
                ></pathfinding-services>
              </v-col>
            </v-row>
          </v-stepper-content>

          <v-stepper-content step="2">
            <v-row justify="center">
              <v-col cols="10">
                <find-routes
                  v-if="step === 2"
                  :token="udcToken"
                  :routes="routes"
                  @select="setRoute($event)"
                ></find-routes>
              </v-col>
            </v-row>
          </v-stepper-content>

          <v-stepper-content step="3">
            <div
              v-if="step === 3 && !processingTransfer"
              class="transfer-steps__total-amount"
            >
              <p>
                {{ $t('transfer.steps.confirm-transfer.total-amount') }}
              </p>
              <h2>
                {{
                  $t('transfer.steps.confirm-transfer.token-amount', {
                    totalAmount: convertToUnits(totalAmount, token.decimals),
                    token: token.symbol
                  })
                }}
              </h2>
            </div>
            <div
              v-if="processingTransfer"
              class="transfer-steps__processing-transfer"
            >
              <v-row justify="center" class="processing-transfer__spinner">
                <spinner />
              </v-row>
              <p class="transfer-steps__processing-transfer__title">
                {{ this.$t('transfer.steps.transfer.title') }}
              </p>
              <p class="transfer-steps__processing-transfer__description">
                {{ this.$t('transfer.steps.transfer.description') }}
              </p>
            </div>
          </v-stepper-content>
        </v-stepper-items>
      </v-stepper>
    </v-row>

    <v-overlay
      v-if="step === 1"
      :value="pfsFeesConfirmed"
      class="confirmation-overlay"
    >
      <spinner v-if="!pfsFeesPaid" />
      <checkmark v-else class="confirmation-overlay__checkmark" />

      <h2 v-if="!pfsFeesPaid">
        {{ this.$t('transfer.steps.request-route.in-progress') }}
      </h2>
      <h2 v-else>{{ this.$t('transfer.steps.request-route.done') }}</h2>
    </v-overlay>

    <stepper
      :display="processingTransfer"
      :steps="steps"
      :done-step="doneStep"
      :done="transferDone"
    ></stepper>

    <error-screen
      :description="error"
      :title="errorTitle"
      :button-label="$t('transfer.error.button')"
      @dismiss="error = ''"
    ></error-screen>

    <action-button
      :enabled="continueBtnEnabled"
      sticky
      arrow
      :text="$t(`transfer.steps.call-to-action.${step}`)"
      @click="handleStep()"
    >
    </action-button>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { RaidenPFS } from 'raiden-ts';
import { BigNumber } from 'ethers/utils';

import { BalanceUtils } from '@/utils/balance-utils';
import { Token, Route, emptyDescription, StepDescription } from '@/model/types';
import NavigationMixin from '@/mixins/navigation-mixin';
import BlockieMixin from '@/mixins/blockie-mixin';
import PathfindingServices from '@/components/PathfindingServices.vue';
import FindRoutes from '@/components/FindRoutes.vue';
import ActionButton from '@/components/ActionButton.vue';
import Spinner from '@/components/Spinner.vue';
import MintDepositDialog from '@/components/MintDepositDialog.vue';
import Checkmark from '@/components/Checkmark.vue';
import Stepper from '@/components/Stepper.vue';
import ErrorScreen from '@/components/ErrorScreen.vue';
import { Zero } from 'ethers/constants';
import { getAddress, getAmount } from '@/utils/query-params';
import AddressUtils from '@/utils/address-utils';

@Component({
  components: {
    PathfindingServices,
    ActionButton,
    FindRoutes,
    Spinner,
    Stepper,
    ErrorScreen,
    Checkmark,
    MintDepositDialog
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
  showMintDeposit: boolean = false;
  mediationFeesConfirmed: boolean = false;
  processingTransfer: boolean = false;
  transferDone: boolean = false;
  errorTitle: string = '';
  error: string = '';
  steps: StepDescription[] = [];
  doneStep: StepDescription = emptyDescription();

  convertToUnits = BalanceUtils.toUnits;
  udcCapacity: BigNumber = Zero;

  amount: string = '';
  target: string = '';

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
    }
  }

  mounted() {
    this.updateUDCCapacity();
  }

  mintDone() {
    this.showMintDeposit = false;
    this.updateUDCCapacity();
  }

  async findRoutes(): Promise<void> {
    const { address, decimals } = this.token;

    try {
      // Fetch available routes from PFS
      const fetchedRoutes = await this.$raiden.findRoutes(
        address,
        this.target,
        BalanceUtils.parse(this.amount, decimals!),
        this.selectedPfs ? this.selectedPfs : undefined
      );

      if (fetchedRoutes) {
        // Convert to displayable Route type
        this.routes = fetchedRoutes.map(
          ({ path, fee }, index: number) =>
            ({
              key: index,
              hops: path.length - 1,
              displayFee: BalanceUtils.toUnits(fee as BigNumber, decimals!),
              fee,
              path
            } as Route)
        );
      }
    } catch (e) {
      this.error = e.message;
    }
  }

  async handleStep() {
    if (this.step === 1 && this.selectedPfs && !this.pfsFeesConfirmed) {
      this.pfsFeesConfirmed = true;
      await this.findRoutes();
      this.pfsFeesPaid = true;

      setTimeout(() => {
        this.step = 2;
      }, 2000);

      return;
    }

    if (this.step === 2 && this.selectedRoute) {
      this.mediationFeesConfirmed = true;
      this.step = 3;
      return;
    }

    if (this.step === 3 && this.selectedRoute && this.selectedPfs) {
      this.transfer();
    }
  }

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.$store.state.tokens[address] || ({ address } as Token);
  }

  get udcToken(): Token {
    const address = this.$raiden.userDepositTokenAddress;
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
      return (
        this.selectedRoute !== null &&
        this.selectedPfs !== null &&
        !this.processingTransfer
      );
    }

    return false;
  }

  get totalAmount(): BigNumber {
    const { decimals } = this.token;
    const transfer: BigNumber = BalanceUtils.parse(this.amount, decimals!);

    return transfer.add(this.selectedRoute!.fee);
  }

  setPFS(pfs: RaidenPFS) {
    this.selectedPfs = pfs;
  }

  setRoute(route: Route) {
    this.selectedRoute = route;
  }

  async transfer() {
    const { address, decimals } = this.token;
    const { path, fee } = this.selectedRoute!;
    this.steps = [
      (this.$t('transfer.steps.transfer') as any) as StepDescription
    ];
    this.doneStep = (this.$t('transfer.steps.done') as any) as StepDescription;
    this.errorTitle = this.$t('transfer.error.title') as string;

    try {
      this.processingTransfer = true;
      await this.$raiden.transfer(
        address,
        this.target,
        BalanceUtils.parse(this.amount, decimals!),
        [{ path, fee }]
      );

      this.transferDone = true;
      this.dismissProgress();
    } catch (e) {
      this.processingTransfer = false;
      this.error = e.message;
    }
  }

  private dismissProgress() {
    setTimeout(() => {
      this.processingTransfer = false;
      this.transferDone = false;
      this.navigateToSelectTransferTarget(this.token.address);
    }, 2000);
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

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
    ::v-deep .v-stepper__label {
      display: block !important;
    }

    &.active {
      ::v-deep .v-stepper__step__step {
        border-color: $primary-color !important;
        background: $primary-color !important;
      }

      ::v-deep .v-stepper__label {
        color: $primary-color;
        font-weight: bold;
      }
    }

    ::v-deep .v-stepper__step__step {
      height: 12px;
      min-width: 12px;
      width: 12px;
      margin-top: 6px;
      background: transparent !important;
      border: 2px solid #646464 !important;
    }
  }

  &__divider {
    border: 1px solid #646464 !important;
    margin: 35px -82px 0 !important;
    &.active {
      border-color: $primary-color !important;
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

  &__total-amount {
    text-align: center;
  }

  .udc-balance {
    &__container {
      text-align: center;
    }

    &__amount {
      font-size: 24px;
      font-weight: bold;
      font-family: Roboto, sans-serif;
      color: $color-white;
      vertical-align: middle;
    }

    &__description {
      font-size: 16px;
      font-family: Roboto, sans-serif;
      color: $secondary-text-color;
    }

    &__deposit {
      vertical-align: middle;
    }
  }
}

.confirmation-overlay {
  text-align: center;

  &.v-overlay--active {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    backdrop-filter: blur(4px);
    background-color: rgba($color-white, 0.15);
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
  }

  & ::v-deep .spinner {
    margin: 2em;
  }

  &__checkmark {
    margin: 2em;
  }
}

.v-dialog__content--active {
  background-color: rgba($color-white, 0.15);
  backdrop-filter: blur(4px);
}
</style>
