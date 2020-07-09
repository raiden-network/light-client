<template>
  <v-container fluid class="transfer">
    <div class="transfer__menus">
      <v-row no-gutters class="transfer__menus__items">
        <v-col cols="11">
          <div class="transfer__menus__items__token-select">
            <span @click="showTokenNetworks = true">
              {{ $t('transfer.change-token-title') }}
              <v-icon>mdi-chevron-down</v-icon>
            </span>
          </div>
        </v-col>
        <v-col cols="1">
          <v-menu transition="scale-transition">
            <template #activator="{ on }">
              <v-btn icon v-on="on">
                <v-icon large>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <div class="transfer__menus__items__channels-deposit">
              <v-row justify="center">
                <span
                  class="transfer__menus__items__channels-deposit--deposit"
                  @click="depositing = true"
                >
                  {{ $t('transfer.deposit-button') }}
                </span>
              </v-row>
              <v-row justify="center">
                <span
                  class="transfer__menus__items__channels-deposit--channels"
                  @click="navigateToChannels(token.address)"
                >
                  {{ $t('transfer.channel-button') }}
                </span>
              </v-row>
            </div>
          </v-menu>
        </v-col>
      </v-row>
      <v-row class="transfer__selected-token" no-gutters justify="center">
        <v-row no-gutters justify="center">
          <amount-display
            class="transfer__selected-token__amount"
            exact-amount
            :amount="capacity"
            :token="token"
          />
        </v-row>
        <v-row
          no-gutters
          class="transfer__selected-token__symbol"
          justify="center"
        >
          {{ token.name | truncate(22) }}
        </v-row>
      </v-row>
      <token-overlay
        :show="showTokenNetworks"
        @cancel="showTokenNetworks = false"
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
    </div>
    <div class="transfer__form-container">
      <v-form
        ref="transfer"
        v-model="valid"
        autocomplete="off"
        novalidate
        @submit.prevent="navigateToTransferSteps(target, amount)"
      >
        <div class="transfer__form-container__form">
          <v-row class="transfer__form-container__form__heading" no-gutters>
            <v-col
              class="transfer__form-container__form__heading--title"
              cols="2"
            >
              {{ $t('transfer.transfer-title') }}
            </v-col>
            <v-col
              class="transfer__form-container__form__heading--error"
              cols="10"
            >
              <span>
                {{ addressError }}
              </span>
              <span>
                {{ amountError }}
              </span>
            </v-col>
          </v-row>
          <v-row class="transfer__form-container__form__address" no-gutters>
            <address-input
              v-model="target"
              class="transfer__form-container__form__address--input"
              :exclude="[token.address, defaultAccount]"
              :block="blockedHubs"
              hide-error-label
              @input-error="addressError = $event"
            />
          </v-row>
          <v-row
            class="transfer__form-container__form__amount-button"
            no-gutters
          >
            <amount-input
              v-model="amount"
              class="transfer__form-container__form__amount-button--amount-input"
              :placeholder="$t('transfer.amount-placeholder')"
              hide-error-label
              limit
              :token="token"
              :max="capacity"
              @input-error="amountError = $event"
            />
            <action-button
              class="transfer__form-container__form__amount-button--button"
              :enabled="valid"
              :text="$t('general.buttons.continue')"
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
  addressError: string = '';
  amountError: string = '';

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

  &__menus {
    background-color: $transfer-screen-color;
    border-radius: 15px;
    height: 175px;
    margin: 0 auto;
    width: 511px;
    @include respond-to(handhelds) {
      width: 100%;
    }

    &__items {
      padding-top: 18px;
      margin-left: 36px;

      &__token-select {
        display: flex;
        justify-content: center;
        align-items: flex-end;
        height: 85%;
        margin: 0 auto;
        border-bottom: solid 1px $color-white;
        width: 130px;
      }

      &__token-select {
        &span {
          cursor: pointer;
        }
      }

      &__channels-deposit {
        background-color: $notification-card-background;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        height: 80px;
        justify-content: center;
        width: 145px;

        &--deposit,
        &--channels {
          align-items: center;
          display: flex;
          cursor: pointer;
        }
      }
    }
  }

  &__selected-token {
    flex-direction: column;
    margin-top: 12px;

    &__amount {
      font-size: 36px;
    }

    &__symbol {
      font-size: 18px;
      padding-top: 10px;
    }
  }

  &__form-container {
    margin-top: 27px;

    &__form {
      background-color: $transfer-screen-color;
      border-radius: 15px;
      margin: 0 auto;
      width: 511px;
      @include respond-to(handhelds) {
        width: 100%;
      }

      &__address {
        margin: 0 20px 0 20px;

        &--input {
          width: 100%;
          padding-bottom: 10px;
          @include respond-to(handhelds) {
            padding: 0 0 10px 0;
          }
        }
      }

      &__heading {
        margin: 0 20px 0 20px;
        padding-top: 16px;
        @include respond-to(handhelds) {
          flex-direction: column;
        }

        &--title {
          color: $secondary-text-color;
          font-weight: bold;
        }

        &--error {
          display: flex;
          flex-direction: column;
          text-align: right;
          color: var(--v-pending-base);
          @include respond-to(handhelds) {
            justify-content: flex-start;
            margin-top: 10px;
          }
        }
      }

      &__amount-button {
        margin: 0 5px 0 20px;
        @include respond-to(handhelds) {
          flex-direction: column;
          margin: 0 20px 0 20px;
        }

        &--amount-input {
          flex: 0 0 300px;
          padding-bottom: 20px;
          @include respond-to(handhelds) {
            flex: none;
            padding: 0 0 20px 0;
          }
        }

        &--button {
          ::v-deep {
            .col-10 {
              display: flex;
              justify-content: flex-end;
              padding-bottom: 6px;
              @include respond-to(handhelds) {
                flex: 1;
                max-width: 100%;
              }
            }

            .v-btn {
              border-radius: 8px;
              min-height: 48px;
              max-width: 150px;
              @include respond-to(handhelds) {
                min-width: 100%;
              }
            }
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
