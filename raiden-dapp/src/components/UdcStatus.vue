<template>
  <div class="udc-status">
    <div class="udc-status__capacity">
      <span
        class="udc-status__capacity__amount"
        :class="{ 'udc-status__capacity__amount--low': capacityTooLow }"
      >
        <amount-display exact-amount :amount="capacity" :token="token" />
      </span>

      <v-tooltip bottom>
        <template #activator="{ on }">
          <v-btn
            text
            icon
            class="udc-status__capacity__deposit-button"
            @click="openDepositDialog"
            v-on="on"
          >
            <v-img :src="require('@/assets/icon-deposit.svg')" />
          </v-btn>
        </template>
        <span>{{ tooltip }}</span>
      </v-tooltip>
    </div>

    <span
      class="udc-status__description"
      :class="{ 'udc-status__description--low': capacityTooLow }"
    >
      {{ description }}
    </span>

    <udc-deposit-dialog
      v-if="showDepositDialog"
      visible="true"
      @cancel="closeDepositDialog"
      @done="depositDone"
    />
  </div>
</template>

<script lang="ts">
import type { BigNumber, BigNumberish } from 'ethers';
import { constants } from 'ethers';
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { createNamespacedHelpers, mapGetters } from 'vuex';

import AmountDisplay from '@/components/AmountDisplay.vue';
import UdcDepositDialog from '@/components/dialogs/UdcDepositDialog.vue';
import type { Token } from '@/model/types';

const { mapState: mapUserDepositContractState } = createNamespacedHelpers('userDepositContract');

@Component({
  computed: {
    ...mapGetters(['mainnet']),
    ...mapUserDepositContractState(['token']),
  },
  components: {
    AmountDisplay,
    UdcDepositDialog,
  },
})
export default class UdcStatus extends Vue {
  @Prop({ required: false })
  pfsPrice!: BigNumberish;

  mainnet!: boolean;
  token!: Token;
  capacity: BigNumber = constants.Zero;
  showDepositDialog = false;

  get capacityTooLow(): boolean {
    return this.capacity.lt(this.pfsPrice);
  }

  get tooltip(): string {
    return this.mainnet
      ? (this.$t('transfer.steps.request-route.tooltip-main') as string)
      : (this.$t('transfer.steps.request-route.tooltip') as string);
  }

  get description(): string {
    if (this.capacityTooLow) {
      return this.$t('transfer.steps.request-route.udc-description-low-balance', {
        token: this.token.symbol,
      }) as string;
    } else {
      return this.$t('transfer.steps.request-route.udc-description') as string;
    }
  }

  created() {
    this.updateCapacity();
  }

  async updateCapacity() {
    this.capacity = await this.$raiden.getUDCCapacity();
    this.emitCapacityUpdate();
  }

  openDepositDialog(): void {
    this.showDepositDialog = true;
  }

  closeDepositDialog(): void {
    this.showDepositDialog = false;
  }

  depositDone(): void {
    this.closeDepositDialog();
    this.updateCapacity();
  }

  @Emit('capacityUpdate')
  emitCapacityUpdate(): BigNumber {
    return this.capacity;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/fonts';

.udc-status {
  display: flex;
  flex-direction: column;
  align-items: center;

  &__capacity {
    display: flex;
    align-items: center;

    &__amount {
      font-size: 30px;
      font-weight: bold;
      font-family: $main-font;
      color: $color-white;
      vertical-align: middle;

      &--low {
        color: $error-color;
      }
    }

    &__deposit-button {
      width: 32px;
      margin-left: 6px;
    }
  }

  &__description {
    font-size: 16px;
    font-family: $main-font;
    text-align: center;
    color: $secondary-text-color;

    &--low {
      color: $error-color;
    }
  }

  &__deposit-button {
    vertical-align: middle;
  }
}
</style>
