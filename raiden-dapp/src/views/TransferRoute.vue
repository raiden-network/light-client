<template>
  <v-container class="transfer" fluid>
    <no-tokens v-if="noTokens" />
    <template v-else>
      <transfer-headers
        class="transfer__menus"
        :token="token"
        :capacity="capacity"
      />
      <transfer-inputs
        class="transfer__inputs"
        :token="token"
        :capacity="capacity"
      />
      <transaction-list class="transfer__list" :token="token" />
      <no-channels-dialog :visible="!openChannels" />
    </template>
  </v-container>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { mapState, mapGetters } from 'vuex';
import TransferHeaders from '@/components/transfer/TransferHeaders.vue';
import TransferInputs from '@/components/transfer/TransferInputs.vue';
import TransactionList from '@/components/transaction-history/TransactionList.vue';
import NoTokens from '@/components/NoTokens.vue';
import NoChannelsDialog from '@/components/dialogs/NoChannelsDialog.vue';
import { RaidenChannel } from 'raiden-ts';
import { BigNumber, constants } from 'ethers';
import { Token, TokenModel } from '@/model/types';
import { NotificationPayload } from '../store/notifications/types';
import { NotificationImportance } from '../store/notifications/notification-importance';
import { NotificationContext } from '../store/notifications/notification-context';
import { RouteNames } from '@/router/route-names';

const ONE_DAY = new Date().setHours(24);

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
    ...mapGetters(['tokens', 'channelWithBiggestCapacity', 'openChannels']),
  },
})
export default class TransferRoute extends Vue {
  stateBackupReminderDateMs!: number;
  tokens!: TokenModel[];
  stateBackupReminder = {
    icon: this.$t('notifications.backup-state.icon') as string,
    title: this.$t('notifications.backup-state.title') as string,
    link: this.$t('notifications.backup-state.link') as string,
    dappRoute: RouteNames.ACCOUNT_BACKUP,
    description: this.$t('notifications.backup-state.description') as string,
    importance: NotificationImportance.HIGH,
    context: NotificationContext.WARNING,
  } as NotificationPayload;
  channelWithBiggestCapacity!: (
    tokenAddress: string
  ) => RaidenChannel | undefined;

  mounted() {
    const currentTime = new Date().getTime();

    if (
      this.stateBackupReminderDateMs === 0 ||
      currentTime > this.stateBackupReminderDateMs + ONE_DAY
    ) {
      this.pushStateBackupNotification(currentTime);
    }
  }

  pushStateBackupNotification(currentTime: number): void {
    this.$store.commit('updateStateBackupReminderDate', currentTime);
    this.$store.commit(
      'notifications/notificationAddOrReplace',
      this.stateBackupReminder
    );
  }

  get noTokens(): boolean {
    return this.tokens.length === 0;
  }

  get token(): Token | undefined {
    if (this.noTokens) {
      return undefined;
    } else {
      const { token } = this.$route.params;
      const address = token ? token : this.tokens[0].address;
      return this.$store.getters.token(address) || ({ address } as Token);
    }
  }

  get capacity(): BigNumber {
    if (this.token) {
      const channelWithBiggestCapacity = this.channelWithBiggestCapacity(
        this.token.address
      );
      return channelWithBiggestCapacity?.capacity ?? constants.Zero;
    } else {
      return constants.Zero;
    }
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
