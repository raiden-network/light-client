<template>
  <v-form v-model="valid" autocomplete="off" class="transfer">
    <v-container fluid class="transfer__settings">
      <v-row
        align="center"
        justify="center"
        no-gutters
        class="transfer__actions"
      >
        <v-col cols="2" class="transfer__channels">
          <v-btn
            text
            class="transfer__channel-button"
            @click="navigateToChannels(token.address)"
          >
            {{ $t('transfer.channel-button') }}
          </v-btn>
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
        <v-col cols="2" class="transfer__deposit">
          <v-dialog v-model="depositing" max-width="425">
            <template #activator="{ on }">
              <v-btn
                text
                class="transfer__deposit-button"
                v-on="on"
                @click="depositing = true"
              >
                {{ $t('transfer.deposit-button') }}
              </v-btn>
            </template>
            <channel-deposit
              v-if="depositing"
              :token="token"
              identifier="0"
              @cancel="depositing = false"
              @confirm="deposit($event)"
            />
          </v-dialog>
        </v-col>
      </v-row>

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
        @click="navigateToTransferSteps(target, amount)"
      ></action-button>
    </v-container>

    <stepper
      :display="loading"
      :steps="steps"
      :done-step="doneStep"
      :done="done"
    ></stepper>

    <error-dialog
      :description="error"
      :title="errorTitle"
      @dismiss="error = ''"
    ></error-dialog>
  </v-form>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import { emptyDescription, StepDescription, Token } from '@/model/types';
import Stepper from '@/components/Stepper.vue';
import ErrorDialog from '@/components/ErrorDialog.vue';
import Divider from '@/components/Divider.vue';
import TokenOverlay from '@/components/TokenOverlay.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';
import ChannelDeposit from '@/components/ChannelDeposit.vue';
import DownArrow from '@/components/icons/DownArrow.vue';
import { BigNumber } from 'ethers/utils';
import { mapGetters, mapState } from 'vuex';
import { RaidenChannel, ChannelState } from 'raiden-ts';
import { Zero } from 'ethers/constants';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';
import { getAddress, getAmount } from '@/utils/query-params';
import BlockieMixin from '@/mixins/blockie-mixin';

@Component({
  components: {
    ChannelDeposit,
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

  errorTitle: string = '';
  error: string = '';

  steps: StepDescription[] = [];
  doneStep: StepDescription = emptyDescription();

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
    this.steps = [
      (this.$t('transfer.steps.deposit') as any) as StepDescription
    ];
    this.doneStep = (this.$t(
      'transfer.steps.deposit-done'
    ) as any) as StepDescription;
    this.errorTitle = this.$t('transfer.error.deposit-title') as string;

    this.loading = true;

    try {
      await this.$raiden.deposit(
        this.token.address,
        this.channelWithBiggestCapacity(this.token.address)!.partner,
        amount
      );
      this.done = true;
      this.dismissProgress();
    } catch (e) {
      this.error = e.message;
    }
    this.loading = false;
    this.depositing = false;
  }

  private dismissProgress() {
    setTimeout(() => {
      this.loading = false;
      this.done = false;
    }, 2000);
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/colors';

.transfer {
  width: 100%;
  height: 100%;

  &__actions {
    margin-top: 10px;
  }

  &__recipient {
    margin-top: 75px;

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
    color: $primary-color;
    text-transform: none;
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
      margin-top: 5px;
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

::v-deep .v-dialog {
  border-radius: 10px !important;
}
</style>
