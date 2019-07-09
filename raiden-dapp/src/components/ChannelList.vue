<template xmlns:v-slot="http://www.w3.org/1999/XSL/Transform">
  <div class="content-host">
    <v-layout justify-center row class="list-container">
      <Transition name="fade-transition" mode="out-in">
        <div v-show="visible" class="overlay" @click="dismiss()"></div>
      </Transition>
      <v-flex xs12>
        <v-list class="channel-list">
          <v-list-group
            v-for="(channel, index) in channels"
            :id="`channel-${channel.id}`"
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
                    {{ channel.ownDeposit | displayFormat(token.decimals) }} |
                    State: {{ channel.state | capitalizeFirst }}
                  </v-list-tile-sub-title>
                </v-list-tile-content>
              </v-list-tile>
            </template>
            <div :id="`expanded-area-${index}`" class="expanded-area">
              <div v-if="visible === `channel-${channel.id}-close`">
                <confirmation
                  :identifier="channel.id"
                  @confirm="close()"
                  @cancel="dismiss()"
                >
                  Are you sure you want to close this channel? <br />
                  This action cannot be undone.
                </confirmation>
              </div>
              <div v-else-if="visible === `channel-${channel.id}-settle`">
                <confirmation
                  :identifier="channel.id"
                  @confirm="settle()"
                  @cancel="dismiss()"
                >
                  Are you sure you want to settle the channel with hub
                  {{ selectedChannel.partner }} for token
                  {{ selectedChannel.token }}?
                </confirmation>
              </div>
              <div v-else-if="visible === `channel-${channel.id}-deposit`">
                <channel-deposit
                  :identifier="channel.id"
                  :token="token"
                  @confirm="deposit($event)"
                  @cancel="dismiss()"
                ></channel-deposit>
              </div>
              <div v-else class="area-content">
                <channel-life-cycle :state="channel.state"></channel-life-cycle>
                <channel-actions
                  :index="index"
                  :channel="channel"
                  @close="onClose($event)"
                  @settle="onSettle($event)"
                  @deposit="onDeposit($event)"
                ></channel-actions>
              </div>
            </div>
          </v-list-group>
        </v-list>
      </v-flex>
    </v-layout>
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
import ChannelDeposit from '@/components/ChannelDeposit.vue';
import { Token, TokenPlaceholder } from '@/model/types';
import BlockieMixin from '@/mixins/blockie-mixin';
import ChannelLifeCycle from '@/components/ChannelLifeCycle.vue';
import Confirmation from '@/components/Confirmation.vue';
import { BigNumber } from 'ethers/utils';
import ChannelActions from '@/components/ChannelActions.vue';

@Component({
  components: {
    ChannelActions,
    Confirmation,
    ChannelLifeCycle,
    ChannelDeposit
  }
})
export default class ChannelList extends Mixins(BlockieMixin) {
  @Prop({ required: true })
  channels!: RaidenChannel[];
  @Prop({ required: true })
  tokenAddress!: string;

  token: Token | null = TokenPlaceholder;
  selectedChannel: RaidenChannel | null = null;
  visible: string = '';
  message: string = '';
  snackbar: boolean = false;

  async created() {
    this.token = await this.$raiden.getToken(this.tokenAddress);
  }

  private showMessage(message: string) {
    this.message = message;
    this.snackbar = true;
  }

  dismiss() {
    this.visible = '';
    this.selectedChannel = null;
  }

  onDeposit(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visible = `channel-${channel.id}-deposit`;
  }

  onClose(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visible = `channel-${channel.id}-close`;
  }

  onSettle(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visible = `channel-${channel.id}-settle`;
  }

  async deposit(deposit: BigNumber) {
    const { token, partner } = this.selectedChannel!;
    this.dismiss();
    try {
      await this.$raiden.deposit(token, partner, deposit);
      this.showMessage('Deposit was successful');
    } catch (e) {
      this.showMessage('Deposit failed');
    }
  }

  async close() {
    const { token, partner } = this.selectedChannel!;
    this.dismiss();
    try {
      await this.$raiden.closeChannel(token, partner);
      this.showMessage('Channel close successful');
    } catch (e) {
      this.showMessage('Channel close failed');
    }
  }

  async settle() {
    const { token, partner } = this.selectedChannel!;
    this.dismiss();
    try {
      await this.$raiden.settleChannel(token, partner);
      this.showMessage('Channel settle was successful');
    } catch (e) {
      this.showMessage('Channel settle failed');
    }
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
  height: 250px;
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
