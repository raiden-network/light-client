<template>
  <v-row no-gutters class="transfer-menus">
    <div class="transfer-menus__token-select">
      <span @click="showTokenNetworks = true">
        {{ $t('transfer.transfer-menus.change-token-title') }}
        <v-icon>mdi-chevron-down</v-icon>
      </span>
    </div>
    <div class="transfer-menus__deposit-channels">
      <v-menu transition="scale-transition">
        <template #activator="{ on }">
          <v-btn
            icon
            class="transfer-menus__deposit-channels--button"
            v-on="on"
          >
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>
        <div class="transfer-menus__deposit-channels__menu">
          <v-btn
            text
            :disabled="noChannels"
            class="transfer-menus__deposit-channels__menu--deposit"
            @click="showDepositDialog = true"
          >
            {{ $t('transfer.transfer-menus.deposit-button') }}
          </v-btn>
          <v-btn
            text
            class="transfer-menus__deposit-channels__menu--channels"
            @click="navigateToChannels(token.address)"
          >
            {{ $t('transfer.transfer-menus.channel-button') }}
          </v-btn>
        </div>
      </v-menu>
    </div>
    <span v-if="noChannels">
      {{ $t('transfer.transfer-menus.no-channels') }}
    </span>
    <span v-else>
      <amount-display exact-amount :amount="capacity" :token="token" />
    </span>
    <token-overlay
      :show="showTokenNetworks"
      @cancel="showTokenNetworks = false"
    />
    <channel-deposit-dialog
      :loading="loading"
      :done="done"
      :token="token"
      :visible="showDepositDialog"
      identifier="0"
      @depositTokens="deposit($event)"
      @cancel="showDepositDialog = false"
    />
  </v-row>
</template>

<script lang="ts">
import { Component, Prop, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import NavigationMixin from '../../mixins/navigation-mixin';
import AmountDisplay from '@/components/AmountDisplay.vue';
import TokenOverlay from '@/components/overlays/TokenOverlay.vue';
import ChannelDepositDialog from '@/components/dialogs/ChannelDepositDialog.vue';
import { RaidenChannel, RaidenError } from 'raiden-ts';
import { Token } from '@/model/types';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';

@Component({
  components: {
    AmountDisplay,
    TokenOverlay,
    ChannelDepositDialog,
  },
  computed: {
    ...mapGetters(['channelWithBiggestCapacity']),
  },
})
export default class TransferMenus extends Mixins(NavigationMixin) {
  showTokenNetworks: boolean = false;
  showDepositDialog: boolean = false;
  loading: boolean = false;
  done: boolean = false;
  error: Error | RaidenError | null = null;
  noCapacity: BigNumber = Zero;

  channelWithBiggestCapacity!: (
    tokenAddress: string
  ) => RaidenChannel | undefined;

  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  capacity!: BigNumber;

  get noChannels(): boolean {
    return this.capacity === this.noCapacity;
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
    } catch (err) {
      this.error = err;
      this.loading = false;
      this.showDepositDialog = false;
    }
  }

  private dismissProgress() {
    setTimeout(() => {
      this.done = false;
      this.showDepositDialog = false;
    }, 2000);
  }
}
</script>

<style lang="scss" scoped>
@import '../../scss/colors';

.transfer-menus {
  background-color: $transfer-screen-bg-color;
  border-radius: 15px;
  height: 160px;
  padding-top: 18px;

  &__token-select {
    height: 25px;
    padding-top: 6px;
    width: calc(100% - 46px);
    text-align: center;

    > span {
      cursor: pointer;
      margin-left: 46px;
    }
  }

  &__deposit-channels {
    width: 46px;

    &--button {
      margin-right: 10px;
    }

    &__menu {
      align-items: center;
      background-color: $transfer-screen-bg-color;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      height: 80px;
      width: 145px;

      &--deposit,
      &--channels {
        align-items: center;
        cursor: pointer;
        display: flex;
        flex: 1;
      }
    }
  }

  > span {
    font-size: 50px;
    font-weight: 300;
    height: 100px;
    text-align: center;
    width: 100%;
  }
}
</style>
