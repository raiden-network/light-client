<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <div class="content-host">
    <v-layout justify-center row class="list-container">
      <v-flex xs12 md12 lg12>
        <v-list three-line>
          <template v-for="(channel, index) in channels">
            <v-list-tile :key="channel.partner" class="channel">
              <v-list-tile-avatar>
                <img
                  :src="$blockie(channel.partner)"
                  alt="Partner address blocky"
                />
              </v-list-tile-avatar>
              <v-list-tile-content>
                <v-list-tile-title>
                  Partner: {{ channel.partner }}
                </v-list-tile-title>
                <v-list-tile-sub-title>
                  Deposit
                  {{ channel.totalDeposit | displayFormat(token.decimals) }}
                </v-list-tile-sub-title>
                <v-list-tile-sub-title>
                  State: {{ channel.state }}
                </v-list-tile-sub-title>
              </v-list-tile-content>
              <v-list-tile-action>
                <v-menu bottom left>
                  <template v-slot:activator="{ on }">
                    <v-btn icon v-on="on" :id="'overflow-' + index">
                      <v-icon>more_vert</v-icon>
                    </v-btn>
                  </template>
                  <v-list>
                    <v-list-tile
                      :id="'deposit-' + index"
                      @click="deposit(channel)"
                      v-if="channel.state === 'open'"
                    >
                      <v-list-tile-title>Deposit</v-list-tile-title>
                    </v-list-tile>
                    <v-list-tile
                      v-if="channel.state === 'open'"
                      :id="'close-' + index"
                      @click="close(channel)"
                    >
                      <v-list-tile-title>Close</v-list-tile-title>
                    </v-list-tile>
                    <v-list-tile
                      v-if="
                        channel.state === 'settleable' ||
                          channel.state === 'settling'
                      "
                      :id="'settle-' + index"
                      @click="settle(channel)"
                    >
                      <v-list-tile-title>Settle</v-list-tile-title>
                    </v-list-tile>

                    <v-list-tile
                      v-if="
                        channel.state !== 'settleable' &&
                          channel.state !== 'settling' &&
                          channel.state !== 'open'
                      "
                      :id="'no-action-' + index"
                    >
                      <v-list-tile-title
                        >No Actions Available</v-list-tile-title
                      >
                    </v-list-tile>
                  </v-list>
                </v-menu>
              </v-list-tile-action>
            </v-list-tile>
          </template>
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
import { Component, Prop, Mixins } from 'vue-property-decorator';
import { RaidenChannel } from 'raiden';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import DepositDialog from '@/components/dialogs/DepositDialog.vue';
import { Token, TokenPlaceholder } from '@/model/types';
import { BalanceUtils } from '@/utils/balance-utils';
import BlockieMixin from '@/mixins/blockie-mixin';

@Component({
  components: { DepositDialog, ConfirmationDialog }
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
</style>
