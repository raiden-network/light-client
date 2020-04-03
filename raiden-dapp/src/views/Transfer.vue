<template>
  <v-container fluid class="transfer__settings">
    <v-row justify="center" no-gutters class="transfer__actions">
      <v-col cols="3" sm="2" class="transfer__channels">
        <action-button
          :text="$t('transfer.channel-button')"
          ghost
          enabled
          full-width
          class="transfer__channel-button"
          @click="navigateToChannels(token.address)"
        ></action-button>
      </v-col>
      <v-col cols="6" class="transfer__token-networks">
        <div class="transfer__token-networks__amount">
          <v-tooltip top>
            <template #activator="{ on }">
              <span v-on="on">
                {{ capacity | displayFormat(token.decimals) }}
                {{ token.symbol || '' }}
              </span>
            </template>
            <span>
              {{ capacity | toUnits(token.decimals) }}
              {{ token.symbol || '' }}
            </span>
          </v-tooltip>
        </div>
        <div
          class="transfer__token-networks__dropdown"
          @click="showTokenNetworks = true"
        >
          <span>{{ token.name }}</span>
          <span>
            <down-arrow />
          </span>
        </div>
        <token-overlay
          :show="showTokenNetworks"
          @cancel="showTokenNetworks = false"
        />
      </v-col>
      <v-col cols="3" sm="2" class="transfer__deposit">
        <action-button
          :text="$t('transfer.deposit-button')"
          ghost
          full-width
          enabled
          class="transfer__deposit-button"
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
import ErrorDialog from '@/components/ErrorDialog.vue';
import Divider from '@/components/Divider.vue';
import TokenOverlay from '@/components/TokenOverlay.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';
import ChannelDepositDialog from '@/components/ChannelDepositDialog.vue';
import DownArrow from '@/components/icons/DownArrow.vue';
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
    DownArrow,
    TokenOverlay
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
@import '../scss/colors';
@import '../scss/mixins';
@import '../scss/fonts';

.transfer {
  &__settings {
    width: 100%;
    height: 100%;
  }

  &__channels,
  &__deposit {
    margin-top: 29px;
  }

  &__actions {
    margin-top: 10px;
  }

  &__recipient {
    margin-top: 75px;

    @include respond-to(handhelds) {
      margin-top: 0;
    }

    &__label {
      color: $secondary-color;
      font-size: 13px;
      font-weight: bold;
      letter-spacing: 3px;
      line-height: 15px;
      text-transform: uppercase;
    }
  }

  &__recipient,
  &__amount {
    max-height: 150px;
  }

  &__action-button {
    margin-bottom: 24px;
  }

  &__channel-button,
  &__deposit-button {
    ::v-deep {
      .v-btn {
        text-transform: none;
        font-size: 16px;
        letter-spacing: 1px;
        font-weight: 500;
        font-family: $main-font;
      }
    }
  }

  &__token-networks {
    &__amount {
      color: $color-white;
      font-size: 24px;
      font-weight: bold;
      line-height: 19px;
      padding-left: 11px;
      margin-top: 10px;
      text-align: center;
    }

    &__dropdown {
      color: $primary-color;
      font-size: 16px;
      letter-spacing: 1px;
      font-weight: 500;
      font-family: $main-font;
      margin-top: 7px;
      cursor: pointer;
      text-align: center;

      &:hover {
        color: $secondary-color;

        ::v-deep {
          g {
            stroke: $secondary-color !important;
          }
        }
      }

      > span {
        display: inline-block;

        &:last-child {
          margin-left: 5px;
        }
      }
    }
  }
}
</style>
