<template>
  <v-row no-gutters class="transfer-menus">
    <div data-cy="transfer_menus_token_select" class="transfer-menus__token-select">
      <span @click="showTokenOverlay = true">
        {{ $t('transfer.transfer-menus.change-token-title') }}
        <v-icon>mdi-chevron-down</v-icon>
      </span>
    </div>
    <div class="transfer-menus__dot-menu">
      <v-menu transition="scale-transition">
        <template #activator="{ on }">
          <v-btn icon data-cy="transfer_menus_dot_menu_button" class="transfer-menus__dot-menu__button" v-on="on">
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>
        <div class="transfer-menus__dot-menu__menu">
          <v-btn
            text
            :disabled="noChannels"
            data-cy="transfer_menus_dot_menu_menu_deposit"
            class="transfer-menus__dot-menu__menu__deposit"
            @click="depositDialogOpen()"
          >
            {{ $t('transfer.transfer-menus.deposit-button') }}
          </v-btn>
          <v-btn
            text
            data-cy="transfer_menus_dot_menu_menu_channels"
            class="transfer-menus__dot-menu__menu__channels"
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
    <token-overlay v-if="showTokenOverlay" @cancel="showTokenOverlay = false" />
    <channel-deposit-dialog
      :loading="loading"
      :done="done"
      :token="token"
      :visible="showDepositDialog"
      identifier="0"
      @deposit-tokens="deposit($event)"
      @cancel="depositDialogClosed()"
    />
    <error-dialog :error="error" @dismiss="error = null" />
  </v-row>
</template>

<script lang="ts">
import { Component, Prop, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import NavigationMixin from '../../mixins/navigation-mixin';
import AmountDisplay from '@/components/AmountDisplay.vue';
import TokenOverlay from '@/components/overlays/TokenOverlay.vue';
import ChannelDepositDialog from '@/components/dialogs/ChannelDepositDialog.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import { RaidenChannel } from 'raiden-ts';
import { Token } from '@/model/types';
import { BigNumber } from 'ethers/utils';
import { Zero } from 'ethers/constants';

@Component({
  components: {
    AmountDisplay,
    TokenOverlay,
    ChannelDepositDialog,
    ErrorDialog,
  },
  computed: {
    ...mapGetters(['channelWithBiggestCapacity']),
  },
})
export default class TransferHeaders extends Mixins(NavigationMixin) {
  showTokenOverlay: boolean = false;
  showDepositDialog: boolean = false;
  loading: boolean = false;
  done: boolean = false;
  error: Error | null = null;

  channelWithBiggestCapacity!: (
    tokenAddress: string
  ) => RaidenChannel | undefined;

  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  capacity!: BigNumber;

  get noChannels(): boolean {
    return this.capacity === Zero;
  }

  depositDialogOpen() {
    this.showDepositDialog = true;
  }

  depositDialogClosed() {
    this.showDepositDialog = false;
  }

  /* istanbul ignore next */
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
    } catch (err) {
      this.error = err;
      this.loading = false;
      this.showDepositDialog = false;
    }
  }

  /* istanbul ignore next */
  private dismissProgress() {
    setTimeout(() => {
      this.done = false;
      this.showDepositDialog = false;
    }, 2000);
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';
@import '@/scss/mixins';

.transfer-menus {
  background-color: $transfer-screen-bg-color;
  border-radius: 15px;
  height: 160px;
  padding-top: 18px;
  @include respond-to(handhelds) {
    height: 135px;
  }

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

  &__dot-menu {
    width: 46px;

    &__button {
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

      &__deposit,
      &__channels {
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
    @include respond-to(handhelds) {
      font-size: 35px;
    }
  }
}
</style>
