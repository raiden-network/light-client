<template>
  <v-row no-gutters data-cy="transfer_inputs" class="transfer-inputs">
    <v-form
      ref="transferForm"
      v-model="valid"
      class="transfer-inputs__form"
      autocomplete="off"
      novalidate
      @submit.prevent="
        navigateToTransferSteps(token.address, syncedTargetAddress, syncedTransferAmount)
      "
    >
      <v-row no-gutters class="transfer-inputs__form__heading">
        <span class="transfer-inputs__form__heading--title">
          {{ $t('transfer.transfer-inputs.title') }}
        </span>
        <div class="transfer-inputs__form__heading__errors">
          <span>
            {{ targetAddressError }}
          </span>
          <span>
            {{ transferAmountError }}
          </span>
        </div>
      </v-row>
      <v-row no-gutters>
        <address-input
          v-model="syncedTargetAddress"
          class="transfer-inputs__form__address"
          :disabled="noChannels"
          :exclude="[token.address, defaultAccount]"
          hide-error-label
          @input-error="targetAddressError = $event"
        />
      </v-row>
      <v-row no-gutters>
        <amount-input
          v-model="syncedTransferAmount"
          class="transfer-inputs__form__amount"
          limit
          hide-error-label
          :disabled="noChannels"
          :token="token"
          :max="maxChannelCapacity"
          :placeholder="$t('transfer.amount-placeholder')"
          @input-error="transferAmountError = $event"
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
import type { BigNumber } from 'ethers';
import { Component, Mixins, Prop, PropSync, Watch } from 'vue-property-decorator';
import type { VForm } from 'vuetify/lib';
import { mapGetters, mapState } from 'vuex';

import type { RaidenChannel } from 'raiden-ts';

import ActionButton from '@/components/ActionButton.vue';
import AddressInput from '@/components/AddressInput.vue';
import AmountInput from '@/components/AmountInput.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { Token } from '@/model/types';

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
  @Prop({ required: true })
  token!: Token;

  @PropSync('transferAmount', { required: true })
  syncedTransferAmount!: string;

  @PropSync('targetAddress', { required: true })
  syncedTargetAddress!: string;

  @Prop({ required: true })
  noChannels!: boolean;

  @Prop({ required: true })
  maxChannelCapacity!: BigNumber;

  defaultAccount!: string;
  channels!: (tokenAddress: string) => RaidenChannel[];
  $refs!: {
    transferForm: VForm;
  };

  valid = false;
  targetAddressError = '';
  transferAmountError = '';

  @Watch('$route', { deep: true })
  onRouteChange() {
    this.$refs.transferForm?.reset();
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
