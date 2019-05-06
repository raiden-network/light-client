<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <div class="content-host">
    <v-layout justify-center row class="list-container">
      <v-flex xs12 md12 lg12>
        <v-list class="channel-list">
          <v-list-group
            :id="'channel-' + channel.id"
            :key="channel.partner"
            class="channel"
            no-action
            v-for="(channel, index) in channels"
          >
            <template v-slot:activator>
              <v-list-tile>
                <v-list-tile-avatar class="list-blockie">
                  <img
                    :src="$blockie(channel.partner)"
                    alt="Partner address blocky"
                  />
                </v-list-tile-avatar>
                <v-list-tile-content>
                  <v-list-tile-title class="partner-address">
                    {{ channel.partner }}
                  </v-list-tile-title>
                  <v-list-tile-sub-title class="state-info">
                    Deposit
                    {{ channel.totalDeposit | displayFormat(token.decimals) }} |
                    State: {{ channel.state | capitalizeFirst }}
                  </v-list-tile-sub-title>
                </v-list-tile-content>
              </v-list-tile>
            </template>
            <div :id="'expanded-area-' + index" class="expanded-area">
              <channel-life-cycle :state="channel.state"></channel-life-cycle>
              <v-layout justify-space-around row>
                <v-btn
                  :disabled="channel.state !== 'open'"
                  :id="'deposit-' + index"
                  @click="deposit(channel)"
                  class="action-button text-capitalize"
                >
                  Deposit
                </v-btn>
                <v-btn
                  :disabled="channel.state !== 'open'"
                  :id="'close-' + index"
                  @click="close(channel)"
                  class="action-button text-capitalize"
                >
                  Close
                </v-btn>
                <v-btn
                  class="action-button text-capitalize"
                  :disabled="
                    channel.state !== 'settleable' &&
                      channel.state !== 'settling'
                  "
                  :id="'settle-' + index"
                  @click="settle(channel)"
                >
                  Settle
                </v-btn>
              </v-layout>
            </div>
          </v-list-group>
        </v-list>
      </v-flex>
    </v-layout>

    <confirmation-dialog
      :display="closeModalVisible"
      @confirm="closeConfirmed()"
      @cancel="closeCancelled()"
    >
      <template v-slot:title>
        Confirm channel close
      </template>
      <div v-if="selectedChannel">
        Are you sure you want to close the channel with hub
        {{ selectedChannel.partner }} for token {{ selectedChannel.token }}?
      </div>
    </confirmation-dialog>

    <confirmation-dialog
      :display="settleModalVisible"
      @confirm="settleConfirmed()"
      @cancel="settleCancelled()"
    >
      <template v-slot:title>
        Confirm channel settle
      </template>
      <div v-if="selectedChannel">
        Are you sure you want to settle the channel with hub
        {{ selectedChannel.partner }} for token {{ selectedChannel.token }}?
      </div>
    </confirmation-dialog>
    <deposit-dialog
      :display="depositModalVisible"
      :channel="selectedChannel"
      :token="token"
      @confirm="depositConfirmed($event)"
      @cancel="depositCancelled()"
    ></deposit-dialog>
    <v-snackbar :multi-line="true" :timeout="3000" bottom v-model="snackbar">
      {{ message }}
      <v-btn color="primary" flat @click="snackbar = false">
        Close
      </v-btn>
    </v-snackbar>
  </div>
</template>

<script lang="ts">
import { Component, Mixins, Prop } from 'vue-property-decorator';
import { RaidenChannel } from 'raiden';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import DepositDialog from '@/components/dialogs/DepositDialog.vue';
import { Token, TokenPlaceholder } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import BlockieMixin from '@/mixins/blockie-mixin';
import ChannelLifeCycle from '@/components/ChannelLifeCycle.vue';

@Component({
  components: { ChannelLifeCycle, DepositDialog, ConfirmationDialog }
})
export default class ChannelList extends Mixins(BlockieMixin) {
  @Prop({ required: true })
  channels!: RaidenChannel[];
  @Prop({ required: true })
  tokenAddress!: string;

  token: Token | null = TokenPlaceholder;
  selectedChannel: RaidenChannel | null = null;
  closeModalVisible: boolean = false;
  depositModalVisible: boolean = false;
  settleModalVisible: boolean = false;
  message: string = '';
  snackbar: boolean = false;

  async created() {
    this.token = await this.$raiden.getToken(this.tokenAddress);
  }

  closeCancelled() {
    this.closeModalVisible = false;
  }

  async closeConfirmed() {
    const channel = this.selectedChannel!;
    const token = channel.token;
    const partner = channel.partner;
    this.dismissCloseModal();
    try {
      await this.$raiden.closeChannel(token, partner);
      this.showMessage('Channel close successful');
    } catch (e) {
      this.showMessage('Channel close failed');
      console.error(e);
    }
  }

  private showMessage(message: string) {
    this.message = message;
    this.snackbar = true;
  }

  private dismissCloseModal() {
    this.closeModalVisible = false;
    this.selectedChannel = null;
  }

  close(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.closeModalVisible = true;
  }

  depositCancelled() {
    this.dismissDepositModal();
  }

  private dismissDepositModal() {
    this.depositModalVisible = false;
    this.selectedChannel = null;
  }

  async depositConfirmed(deposit: string) {
    const { token, partner } = this.selectedChannel!;
    this.dismissDepositModal();
    try {
      await this.$raiden.deposit(
        token,
        partner,
        BalanceUtils.parse(deposit, this.token!.decimals)
      );
      this.showMessage('Deposit was successful');
    } catch (e) {
      this.showMessage('Deposit failed');
      console.error(e);
    }
  }

  deposit(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.depositModalVisible = true;
  }

  private dismissSettleModal() {
    this.settleModalVisible = false;
    this.selectedChannel = null;
  }

  settleCancelled() {
    this.dismissSettleModal();
  }

  async settleConfirmed() {
    const { token, partner } = this.selectedChannel!;
    this.dismissSettleModal();
    try {
      await this.$raiden.settleChannel(token, partner);
      this.showMessage('Channel settle was successful');
    } catch (e) {
      this.showMessage('Channel settle failed');
      console.error(e);
    }
  }

  settle(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.settleModalVisible = true;
  }
}
</script>

<style lang="scss" scoped>
@import '../main';

.channel {
  background-color: #141414;
  box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);
}

.channel .partner-address {
  font-size: 16px;
  line-height: 20px;
}

.channel .state-info {
  color: #696969 !important;
  font-size: 16px;
  line-height: 20px;
}

.channel-list {
  background-color: transparent !important;
}

.channel-list /deep/ .v-list__tile {
  height: 105px;
}

.action-button {
  width: 135px;
  border-radius: 29px;
  background-color: #000000;
}

.expanded-area {
  background-color: #323232;
  padding: 25px;
}
</style>
