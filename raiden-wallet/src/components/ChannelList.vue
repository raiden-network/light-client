<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <div class="content-host">
    <v-layout justify-center row class="list-container">
      <Transition name="fade-transition" mode="out-in">
        <div
          v-show="visibleCloseConfirmation || visibleSettleConfirmation"
          class="overlay"
          @click="closeConfirmation()"
        ></div>
      </Transition>
      <v-flex xs12 md12 lg12>
        <v-list class="channel-list">
          <v-list-group
            v-for="(channel, index) in channels"
            :id="'channel-' + channel.id"
            :key="channel.partner"
            class="channel"
            no-action
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
              <div v-if="visibleCloseConfirmation === `channel-${channel.id}`">
                <confirmation
                  :identifier="channel.id"
                  @confirm="closeConfirmed()"
                  @cancel="closeCancelled()"
                >
                  Are you sure you want to close this channel? <br />
                  This action cannot be undone.
                </confirmation>
              </div>
              <div
                v-else-if="
                  visibleSettleConfirmation === `channel-${channel.id}`
                "
              >
                <confirmation
                  :identifier="channel.id"
                  @confirm="settleConfirmed()"
                  @cancel="settleCancelled()"
                >
                  Are you sure you want to settle the channel with hub
                  {{ selectedChannel.partner }} for token
                  {{ selectedChannel.token }}?
                </confirmation>
              </div>
              <div v-else class="area-content">
                <channel-life-cycle :state="channel.state"></channel-life-cycle>
                <v-layout justify-space-around row>
                  <v-btn
                    :id="'deposit-' + index"
                    :disabled="channel.state !== 'open'"
                    class="action-button text-capitalize"
                    @click="deposit(channel)"
                  >
                    Deposit
                  </v-btn>
                  <v-btn
                    :id="'close-' + index"
                    :disabled="
                      channel.state !== 'open' && channel.state !== 'closing'
                    "
                    class="action-button text-capitalize"
                    @click="close(channel)"
                  >
                    Close
                  </v-btn>
                  <v-btn
                    :id="'settle-' + index"
                    class="action-button text-capitalize"
                    :disabled="
                      channel.state !== 'settleable' &&
                        channel.state !== 'settling'
                    "
                    @click="settle(channel)"
                  >
                    Settle
                  </v-btn>
                </v-layout>
              </div>
            </div>
          </v-list-group>
        </v-list>
      </v-flex>
    </v-layout>

    <deposit-dialog
      :display="depositModalVisible"
      :channel="selectedChannel"
      :token="token"
      @confirm="depositConfirmed($event)"
      @cancel="depositCancelled()"
    ></deposit-dialog>
    <v-snackbar v-model="snackbar" :multi-line="true" :timeout="3000" bottom>
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
import DepositDialog from '@/components/dialogs/DepositDialog.vue';
import { Token, TokenPlaceholder } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import BlockieMixin from '@/mixins/blockie-mixin';
import ChannelLifeCycle from '@/components/ChannelLifeCycle.vue';
import Confirmation from '@/components/Confirmation.vue';

@Component({
  components: {
    Confirmation,
    ChannelLifeCycle,
    DepositDialog
  }
})
export default class ChannelList extends Mixins(BlockieMixin) {
  @Prop({ required: true })
  channels!: RaidenChannel[];
  @Prop({ required: true })
  tokenAddress!: string;

  token: Token | null = TokenPlaceholder;
  selectedChannel: RaidenChannel | null = null;
  visibleCloseConfirmation: string = '';
  visibleSettleConfirmation: string = '';
  depositModalVisible: boolean = false;
  message: string = '';
  snackbar: boolean = false;

  async created() {
    this.token = await this.$raiden.getToken(this.tokenAddress);
  }

  closeCancelled() {
    this.visibleCloseConfirmation = '';
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
    }
  }

  private showMessage(message: string) {
    this.message = message;
    this.snackbar = true;
  }

  private dismissCloseModal() {
    this.visibleCloseConfirmation = '';
    this.selectedChannel = null;
  }

  close(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visibleCloseConfirmation = `channel-${channel.id}`;
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
    }
  }

  deposit(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.depositModalVisible = true;
  }

  private dismissSettleModal() {
    this.visibleSettleConfirmation = '';
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
    }
  }

  settle(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visibleSettleConfirmation = `channel-${channel.id}`;
  }

  closeConfirmation() {
    this.visibleSettleConfirmation = '';
    this.visibleCloseConfirmation = '';
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
  height: 210px;
  .area-content {
    padding: 25px;
  }
  position: relative;
  z-index: 20;
}

.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(30, 30, 30, 0.75);
  z-index: 10;
}
</style>
