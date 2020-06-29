<template>
  <v-form
    ref="form"
    v-model="valid"
    autocomplete="off"
    class="select-hub"
    @submit.prevent="selectHub()"
  >
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
            'low-balance': !hasEnoughServiceTokens
          }"
        >
          <amount-display
            exact-amount
            :amount="udcCapacity"
            :token="udcToken"
          />
          <v-text-field
            v-model="udcCapacity"
            :rules="[() => hasEnoughServiceTokens || '']"
            class="d-none"
            required
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
                  ? 'select-hub.service-token-tooltip-main'
                  : 'select-hub.service-token-tooltip',
                {
                  token: serviceToken
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
          v-if="!hasEnoughServiceTokens"
          class="udc-balance__description low-balance"
        >
          {{
            $t('select-hub.service-token-balance-too-low', {
              token: serviceToken
            })
          }}
        </span>
        <span v-else class="udc-balance__description">
          {{ $t('select-hub.service-token-description') }}
        </span>
      </v-col>
    </v-row>
    <v-row align="center" justify="center" no-gutters>
      <v-col cols="10">
        <address-input
          v-model="partner"
          :value="partner"
          :exclude="[token.address, defaultAccount]"
        ></address-input>
      </v-col>
    </v-row>

    <divider></divider>
    <token-information :token="token"></token-information>

    <action-button
      :enabled="valid"
      :text="$t('select-hub.select-button')"
    ></action-button>
  </v-form>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import isEmpty from 'lodash/isEmpty';
import { mapGetters, mapState } from 'vuex';
import { RaidenChannels } from 'raiden-ts';
import { Network } from 'ethers/utils';
import { Zero } from 'ethers/constants';

import { Token } from '@/model/types';
import AddressInput from '@/components/AddressInput.vue';
import AddressUtils from '@/utils/address-utils';
import AmountDisplay from '@/components/AmountDisplay.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import Divider from '@/components/Divider.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';
import UdcDepositDialog from '@/components/dialogs/UdcDepositDialog.vue';

@Component({
  components: {
    TokenInformation,
    Divider,
    AddressInput,
    ActionButton,
    UdcDepositDialog,
    AmountDisplay
  },
  computed: {
    ...mapState(['defaultAccount', 'channels', 'network']),
    ...mapGetters({
      getToken: 'token',
      mainnet: 'mainnet',
      udcToken: 'udcToken'
    })
  }
})
export default class SelectHub extends Mixins(NavigationMixin) {
  defaultAccount!: string;
  channels!: RaidenChannels;
  network!: Network;
  getToken!: (address: string) => Token;
  mainnet!: boolean;
  udcToken!: Token;

  partner = '';
  valid = true;
  showUdcDeposit = false;
  udcCapacity = Zero;
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

  private async updateUDCCapacity() {
    const { monitoringReward } = this.$raiden;

    this.udcCapacity = await this.$raiden.getUDCCapacity();
    this.hasEnoughServiceTokens = !!(
      monitoringReward && this.udcCapacity.gte(monitoringReward)
    );
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

    await this.$raiden.fetchTokenData([address]);

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
@import '@/scss/fonts';
@import '@/scss/colors';

.select-hub {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
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
    ::v-deep {
      div {
        display: inline-block;
      }
    }
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
</style>
