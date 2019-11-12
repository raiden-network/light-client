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
                  :pfs="selectedPfs"
                  :token="token"
                  :amount="amount"
                  :target="target"
                  @select="setRoute($event)"
                ></find-routes>
              </v-col>
            </v-row>
          </v-stepper-content>

          <v-stepper-content step="3">
            <v-card
              class="mb-12"
              color="grey lighten-1"
              height="400px"
            ></v-card>
          </v-stepper-content>
        </v-stepper-items>
      </v-stepper>
    </v-row>

    <v-overlay
      v-if="step === 1"
      :value="pfsFeesConfirmed"
      class="confirmation-overlay"
    >
      <h2 v-if="!pfsFeesPaid">
        {{ this.$t('transfer.steps.request-route.in-progress') }}
      </h2>
      <h2 v-else>{{ this.$t('transfer.steps.request-route.in-progress') }}</h2>
    </v-overlay>

    <action-button
      :enabled="continueBtnEnabled"
      sticky
      :text="$t(`transfer.steps.call-to-action.${step}`)"
      @click="handleStep()"
    >
    </action-button>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { RaidenPFS } from 'raiden-ts';

import { Token, Route } from '@/model/types';
import NavigationMixin from '@/mixins/navigation-mixin';
import BlockieMixin from '@/mixins/blockie-mixin';
import PathfindingServices from '@/components/PathfindingServices.vue';
import FindRoutes from '@/components/FindRoutes.vue';
import ActionButton from '@/components/ActionButton.vue';

@Component({ components: { PathfindingServices, ActionButton, FindRoutes } })
export default class TransferSteps extends Mixins(
  BlockieMixin,
  NavigationMixin
) {
  step: number = 1;
  selectedPfs: RaidenPFS | null = null;
  selectedRoute: Route | null = null;
  pfsFeesConfirmed: boolean = false;
  pfsFeesPaid: boolean = false;
  mediationFeesConfirmed: boolean = false;

  handleStep() {
    if (this.step === 1 && this.selectedPfs && !this.pfsFeesConfirmed) {
      this.pfsFeesConfirmed = true;

      // Do the PFS payment here
      setTimeout(() => {
        this.step = 2;
      }, 3000);
    }

    if (this.step === 2 && this.selectedRoute) {
      this.mediationFeesConfirmed = true;
      this.step = 3;
    }
  }

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.$store.state.tokens[address] || ({ address } as Token);
  }

  get target(): String {
    return this.$route.params.target;
  }

  get amount(): String {
    return this.$route.params.amount;
  }

  get continueBtnEnabled() {
    if (this.step == 1) {
      return this.selectedPfs !== null;
    }

    if (this.step == 2) {
      return this.selectedRoute !== null;
    }

    return false;
  }

  setPFS(pfs: RaidenPFS) {
    this.selectedPfs = pfs;
  }

  setRoute(route: Route) {
    this.selectedRoute = route;
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.transfer-steps__container {
  height: 100%;
}

.transfer-steps {
  background: transparent;
  box-shadow: none;
  width: 100%;
  position: relative;
}

.transfer-steps__header {
  max-width: 528px;
  margin: 0 auto;
  box-shadow: none;
}

.transfer-steps__step {
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

.transfer-steps__divider {
  border: 1px solid #646464 !important;
  margin: 35px -82px 0 !important;
  &.active {
    border-color: $primary-color !important;
  }
}

.confirmation-overlay {
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
}
</style>
