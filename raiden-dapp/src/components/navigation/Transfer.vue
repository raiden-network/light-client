<template>
  <v-container fluid class="transfer">
    <v-row justify="center" no-gutters>
      <amount-display
        class="transfer__token-network-amount"
        exact-amount
        :amount="capacity"
        :token="token"
      />
      <token-overlay
        :show="showTokenNetworks"
        @cancel="showTokenNetworks = false"
      />
    </v-row>
    <v-row class="transfer__actions" justify="center" no-gutters>
      <v-col cols="3" sm="2">
        <action-button
          :text="$t('transfer.channel-button')"
          ghost
          enabled
          full-width
          class="transfer__top-button"
          @click="navigateToChannels(token.address)"
        ></action-button>
      </v-col>
      <v-col cols="6">
        <action-button
          :text="token.name"
          ghost
          enabled
          full-width
          class="transfer__top-button"
          @click="showTokenNetworks = true"
        ></action-button>
      </v-col>
      <v-col cols="3" sm="2">
        <action-button
          :text="$t('transfer.deposit-button')"
          ghost
          full-width
          enabled
          class="transfer__top-button"
          @click="depositing = true"
        ></action-button>
        <channel-deposit-dialog
          :loading="loading"
          :done="done"
          :token="token"
          :visible="depositing"
          identifier="0"
          @cancel="depositing = false"
          @depositTokens="deposit($event)"
        />
      </v-col>
    </v-row>
    <v-form
      v-model="valid"
      autocomplete="off"
      class="transfer"
      novalidate
      @submit.prevent="navigateToTransferSteps(target, amount)"
    >
      <v-row justify="center" align="center" class="transfer__recipient">
        <v-col cols="10">
          <address-input
            v-model="target"
            :exclude="[token.address, defaultAccount]"
            :block="blockedHubs"
          ></address-input>
        </v-col>
      </v-row>

      <v-row justify="center" align="center">
        <v-col cols="10">
          <amount-input
            v-model="amount"
            :token="token"
            :placeholder="$t('transfer.amount-placeholder')"
            :max="capacity"
            limit
          ></amount-input>
        </v-col>
      </v-row>

      <v-spacer></v-spacer>

      <action-button
        :enabled="valid"
        :text="$t('general.buttons.continue')"
        class="transfer__action-button"
        sticky
        arrow
      ></action-button>
      <error-dialog :error="error" @dismiss="error = null"></error-dialog>
    </v-form>
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import { Token } from '@/model/types';
import Stepper from '@/components/Stepper.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import Divider from '@/components/Divider.vue';
import TokenOverlay from '@/components/overlays/TokenOverlay.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import ChannelDepositDialog from '@/components/dialogs/ChannelDepositDialog.vue';
import { BigNumber } from 'ethers/utils';
import { mapGetters, mapState } from 'vuex';
import { RaidenChannel, ChannelState, RaidenError } from 'raiden-ts';
import { Zero } from 'ethers/constants';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import { getAddress, getAmount } from '@/utils/query-params';
import BlockieMixin from '@/mixins/blockie-mixin';

@Component({
  components: {
    ChannelDepositDialog,
    ActionButton,
    TokenInformation,
    Divider,
    AddressInput,
    AmountInput,
    Stepper,
    ErrorDialog,
    TokenOverlay,
    AmountDisplay
  },
  computed: {
    ...mapState(['defaultAccount']),
    ...mapGetters(['channelWithBiggestCapacity', 'channels'])
  }
})
export default class Transfer extends Mixins(BlockieMixin, NavigationMixin) {
  showTokenNetworks: boolean = false;
  target: string = '';

  defaultAccount!: string;
  amount: string = '';

  valid: boolean = false;
  loading: boolean = false;
  done: boolean = false;
  depositing: boolean = false;

  error: Error | RaidenError | null = null;

  channels!: (tokenAddress: string) => RaidenChannel[];

  channelWithBiggestCapacity!: (
    tokenAddress: string
  ) => RaidenChannel | undefined;

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.$store.getters.token(address) || ({ address } as Token);
  }

  get blockedHubs(): string[] {
    return this.channels(this.token.address)
      .filter((channel: RaidenChannel) => channel.state !== ChannelState.open)
      .map((channel: RaidenChannel) => channel.partner as string);
  }

  get capacity(): BigNumber {
    const withBiggestCapacity = this.channelWithBiggestCapacity(
      this.token.address
    );
    if (withBiggestCapacity) {
      return withBiggestCapacity.capacity;
    }
    return Zero;
  }

  async created() {
    const { amount, target } = this.$route.query;

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

  async deposit(amount: BigNumber) {
    this.loading = true;

    try {
      await this.$raiden.deposit(
        this.token.address,
        this.channelWithBiggestCapacity(this.token.address)!.partner,
        amount
      );
      this.done = true;
      this.loading = false;
      this.dismissProgress();
    } catch (e) {
      this.error = e;
      this.loading = false;
      this.depositing = false;
    }
  }

  private dismissProgress() {
    setTimeout(() => {
      this.done = false;
      this.depositing = false;
    }, 2000);
  }
}
</script>

<style lang="scss" scoped>
@import '../../scss/colors';
@import '../../scss/mixins';
@import '../../scss/fonts';

.transfer {
  width: 100%;
  height: 100%;

  &__token-network-amount {
    color: $color-white;
    font-size: 24px;
    font-weight: bold;
    line-height: 19px;
    margin: 20px 0 10px 0;
    text-align: center;
  }

  &__actions {
    margin-top: 10px;
  }

  &__recipient {
    margin-top: 75px;

    @include respond-to(handhelds) {
      margin-top: 0;
    }
  }
}
</style>
