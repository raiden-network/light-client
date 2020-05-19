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
      <v-col class="transfer__actions__channel-button">
        <action-button
          :text="$t('transfer.channel-button')"
          ghost
          enabled
          full-width
          @click="navigateToChannels(token.address)"
        />
      </v-col>
      <v-col class="transfer__actions__token-button">
        <action-button
          :text="token.name"
          ghost
          enabled
          full-width
          @click="showTokenNetworks = true"
        />
      </v-col>
      <v-col class="transfer__actions__deposit-button">
        <action-button
          :text="$t('transfer.deposit-button')"
          ghost
          full-width
          enabled
          @click="depositing = true"
        />
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
    <div class="transfer__form-container">
      <v-form
        ref="transfer"
        v-model="valid"
        autocomplete="off"
        novalidate
        @submit.prevent="navigateToTransferSteps(target, amount)"
      >
        <v-row class="transfer__form-container__title" no-gutters>
          {{ $t('transfer.transfer-title') }}
        </v-row>
        <div class="transfer__form-container__form">
          <v-row class="transfer__form-container__form__inputs" no-gutters>
            <v-col>
              <address-input
                v-model="target"
                class="transfer__form-container__form__inputs__address-input"
                :exclude="[token.address, defaultAccount]"
                :block="blockedHubs"
              />
            </v-col>
            <v-col>
              <amount-input
                v-model="amount"
                class="transfer__form-container__form__inputs__amount-input"
                :token="token"
                :placeholder="$t('transfer.amount-placeholder')"
                :max="capacity"
                limit
              />
            </v-col>
          </v-row>
          <v-row no-gutters>
            <action-button
              class="transfer__form-container__form__transfer-button"
              full-width
              :enabled="valid"
              :text="$t('general.buttons.continue')"
              arrow
            />
          </v-row>
        </div>
      </v-form>
    </div>
    <error-dialog :error="error" @dismiss="error = null" />
    <transactions-list class="transfer__transactions-list" />
  </v-container>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import { Token } from '@/model/types';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import Divider from '@/components/Divider.vue';
import TokenOverlay from '@/components/overlays/TokenOverlay.vue';
import TokenInformation from '@/components/TokenInformation.vue';
import ActionButton from '@/components/ActionButton.vue';
import AmountDisplay from '@/components/AmountDisplay.vue';
import TransactionsList from '@/components/transaction-history/TransactionsList.vue';
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
    ErrorDialog,
    TokenOverlay,
    AmountDisplay,
    TransactionsList
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

  @Watch('$route', { immediate: true, deep: true })
  onRouteChange() {
    (this.$refs?.transfer as any)?.reset();
  }

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

    if (this.token.decimals === 0 && this.amount.indexOf('.') > -1) {
      this.amount = this.amount.split('.')[0];
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
  height: 100%;
  scrollbar-width: none;
  overflow-y: scroll;
  width: 100%;
  &::-webkit-scrollbar {
    display: none;
  }

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
    display: flex;

    &__channel-button {
      flex: 0 0 80px;
      margin-left: 34px;
      @include respond-to(handhelds) {
        flex: 0 0 60;
        margin: 0;
      }
    }

    &__token-button {
      @include respond-to(handhelds) {
        margin: 0;
        flex: 1;
      }
    }

    &__deposit-button {
      flex: 0 0 80px;
      margin-right: 34px;
      @include respond-to(handhelds) {
        flex: 0 0 60px;
        margin: 0;
      }
    }
  }

  &__form-container {
    margin-top: 50px;

    &__title {
      color: $secondary-text-color;
      font-weight: bold;
      margin-left: 45px;
      padding-bottom: 20px;
      @include respond-to(handhelds) {
        margin: 0;
      }
    }

    &__form {
      background-color: $transfer-form-color;
      border-radius: 15px;
      margin: 0 auto;
      width: 511px;
      padding-bottom: 16px;

      @include respond-to(handhelds) {
        width: 100%;
        display: flex;
        flex-direction: column;
        padding-bottom: 6px;
      }

      &__inputs {
        @include respond-to(handhelds) {
          display: flex;
          flex-direction: column;
        }
        &__address-input {
          margin-left: 23px;
          margin-top: 5px;
          width: 226px;
          @include respond-to(handhelds) {
            flex: none;
            margin: 0 auto;
            padding: 0;
            width: 90%;
          }
        }

        &__amount-input {
          margin-left: auto;
          margin-right: 23px;
          margin-top: 5px;
          width: 189px;
          height: 140px;

          ::v-deep {
            .v-text-field {
              &__details {
                padding-top: 8px;
              }
            }
          }

          @include respond-to(handhelds) {
            flex: none;
            margin: 0 auto;
            padding: 0;
            width: 90%;
          }
        }
      }

      &__transfer-button {
        margin: 10px 23px 0 23px;
        @include respond-to(handhelds) {
          margin: 0 0 10px 0;
        }

        ::v-deep {
          .col-10 {
            flex: 1;
            max-width: 100%;
            @include respond-to(handhelds) {
              max-width: 90%;
            }
          }
          .v-btn {
            border-radius: 8px;
          }
        }
      }
    }
  }

  &__transactions-list {
    padding-right: 46px;
    padding-left: 40px;
    margin-top: 24px;
    @include respond-to(handhelds) {
      padding-right: 0;
      padding-left: 0;
    }
  }
}
</style>
