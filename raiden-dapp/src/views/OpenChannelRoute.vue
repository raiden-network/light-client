<template>
  <div class="open-channel" data-cy="open-channel">
    <channel-open-action
      #default="{ runAction, confirmButtonLabel }"
      :dialog-title="$t('open-channel.title')"
      show-progress-in-dialog
      @completed="onOpenChannelCompleted"
    >
      <channel-action-form
        :token-address="tokenAddress"
        :partner-address="partnerAddress"
        :token-amount="depositAmount"
        :confirm-button-label="confirmButtonLabel"
        :run-action="runAction"
        token-amount-editable
        limit-to-token-balance
        sticky-button
      />
    </channel-open-action>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';

import ChannelActionForm from '@/components/channels/ChannelActionForm.vue';
import ChannelOpenAction from '@/components/channels/ChannelOpenAction.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import AddressUtils from '@/utils/address-utils';

@Component({
  components: {
    ChannelActionForm,
    ChannelOpenAction,
  },
})
export default class OpenChannelRoute extends Mixins(NavigationMixin) {
  tokenAddress = '';
  partnerAddress = '';
  depositAmount = '';

  async created() {
    await this.parseTokenRouteParameter();
    this.parsePartnerRouteParameter();
    this.parseDepositQueryParameter();
  }

  onOpenChannelCompleted(): void {
    this.navigateToSelectTransferTarget(this.tokenAddress);
  }

  async parseTokenRouteParameter(): Promise<void> {
    const { token: tokenAddress } = this.$route.params;

    if (tokenAddress && AddressUtils.checkAddressChecksum(tokenAddress)) {
      this.tokenAddress = tokenAddress;
    } else {
      this.navigateToHome();
    }
  }

  parsePartnerRouteParameter(): void {
    const { partner: partnerAddress } = this.$route.params;

    if (partnerAddress && AddressUtils.checkAddressChecksum(partnerAddress)) {
      this.partnerAddress = partnerAddress;
    } else {
      this.navigateToTokenSelect();
    }
  }

  parseDepositQueryParameter(): void {
    const { deposit: depositAmount } = this.$route.query;

    if (depositAmount) {
      this.depositAmount = depositAmount as string;
    }
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';
@import '@/scss/mixins';

.open-channel {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: 0 26px;
  width: 100%;
  padding-bottom: 50px;

  &__token-information,
  &__partner {
    background-color: $transfer-screen-bg-color;
    border-radius: 8px;
    min-height: 48px;
    align-items: center;
    display: flex;
    margin-top: 16px;
    padding: 0 22px 0 16px;

    &__label {
      flex: 1;
    }

    &__address {
      flex: none;
    }
  }

  &__token-information {
    display: flex;
    justify-content: flex-start;
  }
}
</style>
