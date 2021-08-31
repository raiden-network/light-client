<template>
  <v-row no-gutters class="transfer-menus">
    <div data-cy="transfer_menus_token_select" class="transfer-menus__token-select">
      <span @click="showTokenOverlay = true">
        {{ $t('transfer.transfer-menus.select-token-title') }}
        <v-icon>mdi-chevron-down</v-icon>
      </span>
    </div>
    <div class="transfer-menus__dot-menu">
      <v-menu transition="scale-transition">
        <template #activator="{ on }">
          <v-btn
            icon
            data-cy="transfer_menus_dot_menu_button"
            class="transfer-menus__dot-menu__button"
            v-on="on"
          >
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>
        <div class="transfer-menus__dot-menu__menu">
          <v-btn
            text
            :disabled="noChannels"
            data-cy="transfer_menus_dot_menu_menu_deposit"
            class="transfer-menus__dot-menu__menu__deposit"
            @click="openDepositDialog()"
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

    <div class="transfer-menus__capacity">
      <template v-if="noChannels">{{ $t('transfer.transfer-menus.no-channels') }} </template>

      <template v-else>
        <amount-display exact-amount :amount="totalCapacity" :token="token" />
      </template>
    </div>

    <token-overlay v-if="showTokenOverlay" @cancel="showTokenOverlay = false" />

    <channel-deposit-dialog
      v-if="showDepositDialog"
      :token-address="token.address"
      :partner-address="biggestChannelPartner"
      @close="closeDepositDialog"
    />

    <error-dialog :error="error" @dismiss="error = null" />
  </v-row>
</template>

<script lang="ts">
import type { BigNumber } from 'ethers';
import { Component, Mixins, Prop } from 'vue-property-decorator';
import { mapGetters } from 'vuex';

import type { RaidenChannel } from 'raiden-ts';

import AmountDisplay from '@/components/AmountDisplay.vue';
import ChannelDepositDialog from '@/components/channels/ChannelDepositDialog.vue';
import ErrorDialog from '@/components/dialogs/ErrorDialog.vue';
import TokenOverlay from '@/components/overlays/TokenOverlay.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { Token } from '@/model/types';

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
  showTokenOverlay = false;
  showDepositDialog = false;
  loading = false;
  done = false;
  error: Error | null = null;

  channelWithBiggestCapacity!: (tokenAddress: string) => RaidenChannel | undefined;

  @Prop({ required: true })
  token!: Token;
  @Prop({ required: true })
  noChannels!: boolean;
  @Prop({ required: true })
  totalCapacity!: BigNumber;

  get biggestChannelPartner(): string {
    return this.channelWithBiggestCapacity(this.token.address)!.partner;
  }

  openDepositDialog() {
    this.showDepositDialog = true;
  }

  closeDepositDialog() {
    this.showDepositDialog = false;
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

  &__capacity {
    display: flex;
    justify-content: center;
    font-size: 50px;
    font-weight: 300;
    height: 100px;
    width: 100%;

    @include respond-to(handhelds) {
      height: 70px;
      font-size: 35px;
    }
  }
}
</style>
