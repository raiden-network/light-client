<template>
  <v-row no-gutters class="transfer__inputs">
    <v-form
      ref="transfer"
      v-model="valid"
      class="transfer__inputs__form"
      autocomplete="off"
      novalidate
      @submit.prevent="navigateToTransferSteps(target, amount)"
    >
      <v-row no-gutters class="transfer__inputs__form__heading">
        <span class="transfer__inputs__form__heading--title">
          {{ $t('transfer.transfer-inputs.title') }}
        </span>
        <div class="transfer__inputs__form__heading__errors">
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
          class="transfer__inputs__form__address"
          :exclude="[token.address, defaultAccount]"
          hide-error-label
          :block="blockedHubs"
          @input-error="addressError = $event"
        />
      </v-row>
      <v-row no-gutters>
        <amount-input
          v-model="amount"
          class="transfer__inputs__form__amount"
          limit
          hide-error-label
          :token="token"
          :max="capacity"
          :placeholder="$t('transfer.amount-placeholder')"
          @input-error="amountError = $event"
        />
        <action-button
          class="transfer__inputs__form__button"
          :enabled="valid"
          :text="$t('general.buttons.continue')"
        />
      </v-row>
    </v-form>
  </v-row>
</template>

<script lang="ts">
import { Component, Prop, Watch, Mixins } from 'vue-property-decorator';
import NavigationMixin from '../../mixins/navigation-mixin';
import { mapState, mapGetters } from 'vuex';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import ActionButton from '@/components/ActionButton.vue';
import { getAmount, getAddress } from '@/utils/query-params';
import AddressUtils from '@/utils/address-utils';
import { RaidenChannel, ChannelState } from 'raiden-ts';
import { BigNumber } from 'ethers/utils';
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
  valid: boolean = false;
  amount: string = '';
  target: string = '';
  defaultAccount!: string;
  addressError: string = '';
  amountError: string = '';

  channels!: (tokenAddress: string) => RaidenChannel[];

  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  capacity!: BigNumber;

  @Watch('$route', { immediate: true, deep: true })
  onRouteChange() {
    (this.$refs?.transfer as any)?.reset();
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

  get blockedHubs(): string[] {
    return this.channels(this.token.address)
      .filter((channel: RaidenChannel) => channel.state !== ChannelState.open)
      .map((channel: RaidenChannel) => channel.partner as string);
  }
}
</script>

<style lang="scss" scoped>
@import '../../scss/colors';
@import '../../scss/mixins';

.transfer__inputs {
  background-color: $transfer-screen-bg-color;
  border-radius: 15px;

  &__form {
    width: 100%;

    &__heading {
      display: flex;
      height: 40px;
      margin: 16px 23px 0 23px;

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
      margin: 0 20px 0 20px;
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
      margin-left: 20px;
      width: 300px;
      @include respond-to(handhelds) {
        margin-right: 20px;
        width: 100%;
        padding: 0px;
      }
    }

    &__button {
      padding-bottom: 30px;
      @include respond-to(handhelds) {
        margin: 0 20px 20px 20px;
        padding: 0;
        width: 100%;
      }

      ::v-deep {
        .col-10 {
          display: flex;
          justify-content: flex-end;
          padding-top: 16px;
          @include respond-to(handhelds) {
            min-width: 100%;
          }
        }

        .v-btn {
          border-radius: 8px;
          min-height: 49px;
          max-width: 150px;
          @include respond-to(handhelds) {
            min-width: 100%;
          }
        }
      }
    }
  }
}
</style>
