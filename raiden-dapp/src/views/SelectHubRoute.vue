<template>
  <v-form
    ref="form"
    v-model="valid"
    autocomplete="off"
    data-cy="select_hub"
    class="select-hub"
    @submit.prevent="selectHub()"
  >
    <div class="select-hub__udc">
      <div class="select-hub__udc__balance" :class="{ 'low-balance': !hasEnoughServiceTokens }">
        <amount-display exact-amount :amount="udcCapacity" :token="udcToken" />
        <v-tooltip bottom>
          <template #activator="{ on }">
            <v-btn
              icon
              data-cy="select_hub_udc_balance_deposit"
              class="select-hub__udc__balance__deposit"
              @click="showUdcDeposit = true"
              v-on="on"
            >
              <v-img :src="require('@/assets/icon-deposit.svg')" />
            </v-btn>
          </template>
          <span>
            {{
              $t(
                mainnet
                  ? 'select-hub.service-token-tooltip-main'
                  : 'select-hub.service-token-tooltip',
                {
                  token: serviceToken,
                },
              )
            }}
          </span>
        </v-tooltip>
      </div>
      <span class="select-hub__udc__description">
        {{ $t('select-hub.service-token-description').toUpperCase() }}
      </span>
    </div>
    <div class="select-hub__address-input">
      <address-input
        v-model="partner"
        :value="partner"
        :exclude="[token.address, defaultAccount]"
      />
    </div>
    <div class="select-hub__hub-list">
      <hub-list :token-address="token.address" @select-hub="setSuggestedPartner($event)" />
    </div>
    <div class="select-hub__token-balance">
      <token-information :token="token" />
    </div>
    <div class="select-hub__button">
      <action-button
        data-cy="select_hub_button"
        :enabled="valid"
        :text="$t('select-hub.select-button')"
      />
    </div>
    <udc-deposit-dialog
      :visible="showUdcDeposit"
      @cancel="showUdcDeposit = false"
      @done="mintDone()"
    />
  </v-form>
</template>

<script lang="ts">
import type { providers } from 'ethers';
import { constants } from 'ethers';
import isEmpty from 'lodash/isEmpty';
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';

import type { RaidenChannels } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import AddressInput from '@/components/AddressInput.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import UdcDepositDialog from '@/components/dialogs/UdcDepositDialog.vue';
import Divider from '@/components/Divider.vue';
import HubList from '@/components/HubList.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { Token } from '@/model/types';
import AddressUtils from '@/utils/address-utils';

@Component({
  components: {
    TokenInformation,
    Divider,
    AddressInput,
    ActionButton,
    UdcDepositDialog,
    AmountDisplay,
    HubList,
  },
  computed: {
    ...mapState(['defaultAccount', 'channels', 'network']),
    ...mapState('userDepositContract', { udcToken: 'token' }),
    ...mapGetters({
      getToken: 'token',
      mainnet: 'mainnet',
    }),
  },
})
export default class SelectHubRoute extends Mixins(NavigationMixin) {
  defaultAccount!: string;
  channels!: RaidenChannels;
  network!: providers.Network;
  getToken!: (address: string) => Token;
  mainnet!: boolean;
  udcToken!: Token;

  partner = '';
  valid = true;
  showUdcDeposit = false;
  udcCapacity = constants.Zero;
  hasEnoughServiceTokens = false;

  async mounted() {
    await this.updateUDCCapacity();
  }

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.getToken(address) || ({ address } as Token);
  }

  selectHub() {
    this.navigateToOpenChannel(this.token.address, this.partner);
  }

  setSuggestedPartner(selectedPartner: string): void {
    if (!selectedPartner) {
      (this.$refs.form as Vue & { reset: () => boolean }).reset();
    } else {
      this.partner = selectedPartner;
    }
  }

  private async updateUDCCapacity() {
    const { monitoringReward } = this.$raiden;

    this.udcCapacity = await this.$raiden.getUDCCapacity();
    this.hasEnoughServiceTokens = !!(monitoringReward && this.udcCapacity.gte(monitoringReward));
  }

  get isConnectedToHub() {
    const { token: address } = this.$route.params;
    return !isEmpty(this.channels[address]);
  }

  get serviceToken(): string {
    return this.udcToken.symbol ?? (this.mainnet ? 'RDN' : 'SVT');
  }

  async created() {
    const { token: address } = this.$route.params;
    if (!AddressUtils.checkAddressChecksum(address)) {
      this.navigateToHome();
      return;
    }

    await this.$raiden.fetchAndUpdateTokenData([address]);

    if (typeof this.token.decimals !== 'number') {
      this.navigateToHome();
    }

    await this.$raiden.monitorToken(address);

    // On goerli, we can suggest our hub if the user is not connected yet
    if (!this.isConnectedToHub && this.network.name === 'goerli') {
      this.partner = process.env.VUE_APP_HUB ?? '';
    }
  }

  async mintDone() {
    this.showUdcDeposit = false;
    await this.updateUDCCapacity();
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/mixins';

.select-hub {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: 0 26px;
  width: 100%;
  @include respond-to(handhelds) {
    overflow-y: auto;
  }

  &__udc,
  &__hub-list,
  &__token-balance {
    background-color: $transfer-screen-bg-color;
    border-radius: 8px;
  }

  &__address-input,
  &__hub-list,
  &__token-balance {
    margin-top: 16px;
  }

  &__udc {
    align-items: center;
    display: flex;
    flex-direction: column;
    height: 120px;

    &__balance {
      display: flex;
      font-size: 36px;
      font-weight: 500;
      padding-top: 22px;

      &.low-balance {
        color: $error-color;
      }

      &__deposit {
        height: 32px;
        margin: 8px 0 0 6px;
      }
    }

    &__description {
      color: $color-gray;
      font-size: 12px;
      padding: 4px 6px 0 0;
    }
  }

  &__address-input {
    flex: none;
  }

  &__hub-list {
    height: auto;
    padding-bottom: 16px;
  }

  &__token-balance {
    height: 48px;
  }

  &__button {
    align-items: flex-end;
    display: flex;
    flex: 1;
    margin-bottom: 38px;
    @include respond-to(handhelds) {
      flex: none;
      margin-bottom: none;

      ::v-deep {
        .col-10 {
          padding-top: 28px;
          @include respond-to(handhelds) {
            min-width: 100%;
          }
        }

        .v-btn {
          @include respond-to(handhelds) {
            min-width: 100%;
          }
        }
      }
    }
  }
}
</style>
