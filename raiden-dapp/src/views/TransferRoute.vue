<template>
  <v-container class="transfer" fluid>
    <no-tokens v-if="noTokens" />
    <template v-else>
      <transfer-headers
        class="transfer__menus"
        :token="token"
        :no-channels="noChannels"
        :total-capacity="totalCapacity"
      />
      <transfer-inputs
        class="transfer__inputs"
        :token.sync="token"
        :transfer-amount.sync="transferAmount"
        :target-address.sync="targetAddress"
        :no-channels="noChannels"
        :max-channel-capacity="maxChannelCapacity"
      />
      <transaction-list class="transfer__list" :token="token" />
      <no-channels-dialog :visible="!openChannels" />
    </template>
  </v-container>
</template>

<script lang="ts">
import type { BigNumber } from 'ethers';
import { constants } from 'ethers';
import { Component, Vue, Watch } from 'vue-property-decorator';
import { mapGetters, mapState } from 'vuex';

import type { RaidenChannel } from 'raiden-ts';

import NoChannelsDialog from '@/components/dialogs/NoChannelsDialog.vue';
import NoTokens from '@/components/NoTokens.vue';
import TransactionList from '@/components/transaction-history/TransactionList.vue';
import TransferHeaders from '@/components/transfer/TransferHeaders.vue';
import TransferInputs from '@/components/transfer/TransferInputs.vue';
import type { Token } from '@/model/types';
import { RouteNames } from '@/router/route-names';
import { NotificationContext } from '@/store/notifications/notification-context';
import { NotificationImportance } from '@/store/notifications/notification-importance';
import type { NotificationPayload } from '@/store/notifications/types';
import type { Tokens } from '@/types';
import AddressUtils from '@/utils/address-utils';

const ONE_DAY = new Date(0).setUTCHours(24);

@Component({
  components: {
    NoTokens,
    TransferHeaders,
    TransferInputs,
    TransactionList,
    NoChannelsDialog,
  },
  computed: {
    ...mapState(['stateBackupReminderDateMs']),
    ...mapGetters(['tokensWithChannels', 'channels', 'channelWithBiggestCapacity']),
  },
})
export default class TransferRoute extends Vue {
  tokensWithChannels!: Tokens;
  stateBackupReminderDateMs!: number;
  channels!: (tokenAddress: string) => RaidenChannel[];
  channelWithBiggestCapacity!: (tokenAddress: string) => RaidenChannel | undefined;

  token: Token | null = null;
  transferAmount = '';
  targetAddress = '';

  get noTokens(): boolean {
    return Object.keys(this.tokensWithChannels).length === 0;
  }

  get noChannels(): boolean {
    if (this.token) {
      return this.channels(this.token.address).length === 0;
    } else {
      return true;
    }
  }

  get shouldPushBackupNotification(): boolean {
    const currentTime = new Date().getTime();
    return (
      this.stateBackupReminderDateMs === 0 ||
      currentTime > this.stateBackupReminderDateMs + ONE_DAY
    );
  }

  get maxChannelCapacity(): BigNumber {
    if (this.token) {
      const channelWithBiggestCapacity = this.channelWithBiggestCapacity(this.token.address);
      return channelWithBiggestCapacity?.capacity ?? constants.Zero;
    } else {
      return constants.Zero;
    }
  }

  get totalCapacity(): BigNumber {
    if (this.token) {
      const channels = this.channels(this.token.address);
      return channels
        .map((channel) => channel.capacity)
        .reduce((previousValue, currentValue) => previousValue.add(currentValue), constants.Zero);
    } else {
      return constants.Zero;
    }
  }

  created() {
    this.selectFirstAvailableTokenIfAny();
  }

  mounted() {
    this.handleBackupNotification();
  }

  @Watch('$route.params.token', { immediate: true })
  async onTokenRouteParameterChanged(tokenAddress: string | undefined) {
    if (!tokenAddress) {
      this.selectFirstAvailableTokenIfAny();
    } else if (AddressUtils.checkAddressChecksum(tokenAddress)) {
      this.token = await this.getTokenFromStore(tokenAddress);
    }
  }

  @Watch('$route.query.amount', { immediate: true })
  async onAmountQueryParameterChanged(transferAmount: string | undefined) {
    this.transferAmount = transferAmount ?? '';
  }

  @Watch('$route.query.target', { immediate: true })
  async onTargetQueryParameterChanged(targetAddress: string | undefined) {
    this.targetAddress = targetAddress ?? '';
  }

  async getTokenFromStore(tokenAddress: string): Promise<Token> {
    if (!(tokenAddress in this.tokensWithChannels)) {
      await this.$raiden.fetchAndUpdateTokenData([tokenAddress]);
    }

    // From the SDK implementation it should not be possible undefined here as
    // it should have thrown earier on the fetch procedure.
    return this.tokensWithChannels[tokenAddress];
  }

  selectFirstAvailableTokenIfAny(): void {
    if (!this.noTokens) {
      this.token = Object.values(this.tokensWithChannels)[0];
    }
  }

  handleBackupNotification(): void {
    if (this.shouldPushBackupNotification) {
      this.pushStateBackupNotification();
    }
  }

  pushStateBackupNotification(): void {
    const currentTime = new Date().getTime();
    const stateBackupReminder = {
      icon: this.$t('notifications.backup-state.icon') as string,
      title: this.$t('notifications.backup-state.title') as string,
      link: this.$t('notifications.backup-state.link') as string,
      dappRoute: RouteNames.ACCOUNT_BACKUP,
      description: this.$t('notifications.backup-state.description') as string,
      duration: 60000,
      importance: NotificationImportance.HIGH,
      context: NotificationContext.WARNING,
    } as NotificationPayload;

    this.$store.commit('updateStateBackupReminderDate', currentTime);
    this.$store.commit('notifications/notificationAddOrReplace', stateBackupReminder);
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/mixins';

.transfer {
  display: flex;
  flex-direction: column;
  @include respond-to(handhelds) {
    overflow-y: auto;
  }

  &__menus,
  &__inputs,
  &__list {
    margin: 0 auto;
    width: 550px;
    @include respond-to(handhelds) {
      width: 100%;
    }
  }

  &__inputs,
  &__list {
    margin-top: 20px;
  }
}
</style>
