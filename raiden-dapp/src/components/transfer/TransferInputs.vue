<template>
  <v-row no-gutters data-cy="transfer_inputs" class="transfer-inputs">
    <v-form
      ref="transfer"
      v-model="valid"
      class="transfer-inputs__form"
      autocomplete="off"
      novalidate
      @submit.prevent="navigateToTransferSteps(token.address, target, amount)"
    >
      <v-row no-gutters class="transfer-inputs__form__heading">
        <span class="transfer-inputs__form__heading--title">
          {{ $t('transfer.transfer-inputs.title') }}
        </span>
        <div class="transfer-inputs__form__heading__errors">
          <span>
            {{ addressError }}
          </span>
          <span>
            {{ amountError }}
          </span>
        </div>
      </v-row>
      <v-row no-gutters>
        <address-input
          v-model="target"
          class="transfer-inputs__form__address"
          :disabled="noChannels"
          :exclude="[token.address, defaultAccount]"
          hide-error-label
          :block="blockedHubs"
          @input-error="addressError = $event"
        />
      </v-row>
      <v-row no-gutters>
        <amount-input
          v-model="amount"
          class="transfer-inputs__form__amount"
          limit
          hide-error-label
          :disabled="noChannels"
          :token="token"
          :max="capacity"
          :placeholder="$t('transfer.amount-placeholder')"
          @input-error="amountError = $event"
        />
        <action-button
          data-cy="transfer_inputs_form_button"
          class="transfer-inputs__form__button"
          :enabled="valid"
          :text="$t('general.buttons.continue')"
        />
      </v-row>
    </v-form>
  </v-row>
</template>

<script lang="ts">
import { Component, Prop, Watch, Mixins } from 'vue-property-decorator';
import { mapState, mapGetters } from 'vuex';
import { BigNumber, constants } from 'ethers';
import { VForm } from 'vuetify/lib';
import NavigationMixin from '../../mixins/navigation-mixin';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import ActionButton from '@/components/ActionButton.vue';
import { getAmount, getAddress } from '@/utils/query-params';
import AddressUtils from '@/utils/address-utils';
import { RaidenChannel, ChannelState } from 'raiden-ts';
import { Token } from '@/model/types';

@Component({
  components: {
    AddressInput,
    AmountInput,
    ActionButton,
  },
  computed: {
    ...mapState(['defaultAccount']),
    ...mapGetters(['channels']),
  },
})
export default class TransferInputs extends Mixins(NavigationMixin) {
  valid = false;
  amount = '';
  target = '';
  defaultAccount!: string;
  addressError = '';
  amountError = '';

  channels!: (tokenAddress: string) => RaidenChannel[];

  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  capacity!: BigNumber;

  $refs!: {
    transfer: VForm;
  };

  @Watch('$route', { immediate: true, deep: true })
  onRouteChange() {
    this.$refs.transfer.reset();
  }

  async created() {
    const { token: address } = this.$route.params;
    const { amount, target } = this.$route.query;
    this.amount = getAmount(amount);
    this.target = getAddress(target);

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

  get noChannels(): boolean {
    return this.capacity === constants.Zero;
  }

  get blockedHubs(): string[] {
    return this.channels(this.token.address)
      .filter((channel: RaidenChannel) => channel.state !== ChannelState.open)
      .map((channel: RaidenChannel) => channel.partner as string);
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/mixins';

.transfer-inputs {
  background-color: $transfer-screen-bg-color;
  border-radius: 15px;
  padding: 20px;

  &__form {
    width: 100%;

    &__heading {
      display: flex;
      height: 40px;

      &--title {
        flex: none;
        font-size: 18px;
      }

      &__errors {
        color: var(--v-pending-base);
        display: flex;
        flex: 1;
        flex-direction: column;
        font-size: 14px;
        text-align: right;
      }
    }

    &__address {
      width: 100%;
      @include respond-to(handhelds) {
        padding: 0px;
      }

      ::v-deep {
        .v-input {
          padding-top: 0;
        }
      }
    }

    &__amount {
      width: 70%;
      @include respond-to(handhelds) {
        width: 100%;
        padding: 0px;
      }
    }

    &__button {
      padding-bottom: 30px;

      @include respond-to(handhelds) {
        padding: 0;
        width: 100%;
      }

      ::v-deep {
        .col-10 {
          display: flex;
          padding-top: 16px;
          @include respond-to(handhelds) {
            min-width: 100%;
          }
        }

        .v-btn {
          border-radius: 8px;
          min-height: 49px;
          max-width: 140px;
          @include respond-to(handhelds) {
            min-width: 100%;
          }
        }
      }
    }
  }
}
</style>
