<template>
  <v-layout>
    <v-flex xs12>
      <v-list class="channels">
        <v-list-group
          v-for="(channel, index) in channels"
          :id="`channel-${channel.id}`"
          :key="channel.partner"
          class="channel"
          no-action
        >
          <template #activator>
            <v-list-tile>
              <v-list-tile-avatar class="channels__icon">
                <img
                  class="indenticon"
                  :src="$blockie(channel.partner)"
                  alt="Partner address blocky"
                />
              </v-list-tile-avatar>
              <v-list-tile-content>
                <v-list-tile-title class="channels__partner-address">
                  {{ channel.partner }}
                </v-list-tile-title>
                <v-list-tile-sub-title class="channels__state-info">
                  Deposit
                  {{ channel.ownDeposit | displayFormat(token.decimals) }} |
                  State: {{ channel.state | capitalizeFirst }}
                </v-list-tile-sub-title>
              </v-list-tile-content>
            </v-list-tile>
          </template>
          <div :id="`expanded-area-${index}`" class="channels__expanded-area">
            <div v-if="visible === `channel-${channel.id}-close`">
              <confirmation
                :identifier="channel.id"
                @confirm="close()"
                @cancel="dismiss()"
              >
                <template #header>
                  Close Channel
                </template>

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
                <template #header>
                  Settle Channel
                </template>
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
            <div v-else class="channels__area-content">
              <channel-life-cycle
                :state="channel.state"
                class="channels__lifecycle"
              ></channel-life-cycle>
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
</template>

<script lang="ts">
import { Component, Emit, Mixins, Prop, Watch } from 'vue-property-decorator';
import { RaidenChannel } from 'raiden';
import { Token, TokenPlaceholder } from '@/model/types';
import ChannelActions from '@/components/ChannelActions.vue';
import ChannelLifeCycle from '@/components/ChannelLifeCycle.vue';
import ChannelDeposit from '@/components/ChannelDeposit.vue';
import Confirmation from '@/components/Confirmation.vue';
import { BigNumber } from 'ethers/utils';
import BlockieMixin from '@/mixins/blockie-mixin';

@Component({
  components: {
    ChannelActions,
    ChannelLifeCycle,
    ChannelDeposit,
    Confirmation
  }
})
export default class ChannelList extends Mixins(BlockieMixin) {
  @Prop({ required: true })
  channels!: RaidenChannel[];
  @Prop({ required: true })
  tokenAddress!: string;
  @Prop({ required: true })
  visible!: string;

  token: Token | null = TokenPlaceholder;
  selectedChannel: RaidenChannel | null = null;

  // noinspection JSUnusedLocalSymbols
  @Emit()
  message(message: string) {}

  // noinspection JSUnusedLocalSymbols
  @Emit()
  visibleChanged(element: string) {}

  async created() {
    this.token = await this.$raiden.getToken(this.tokenAddress);
  }

  @Watch('visible')
  onVisibilityChange() {
    if (this.visible === '') {
      this.selectedChannel = null;
    }
  }

  dismiss() {
    this.visibleChanged('');
  }

  onDeposit(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visibleChanged(`channel-${channel.id}-deposit`);
  }

  onClose(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visibleChanged(`channel-${channel.id}-close`);
  }

  onSettle(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visibleChanged(`channel-${channel.id}-settle`);
  }

  async deposit(deposit: BigNumber) {
    const { token, partner } = this.selectedChannel!;
    this.dismiss();
    try {
      await this.$raiden.deposit(token, partner, deposit);
      this.message('Deposit was successful');
    } catch (e) {
      this.message('Deposit failed');
    }
  }

  async close() {
    const { token, partner } = this.selectedChannel!;
    this.dismiss();
    try {
      await this.$raiden.closeChannel(token, partner);
      this.message('Channel close successful');
    } catch (e) {
      this.message('Channel close failed');
    }
  }

  async settle() {
    const { token, partner } = this.selectedChannel!;
    this.dismiss();
    try {
      await this.$raiden.settleChannel(token, partner);
      this.message('Channel settle was successful');
    } catch (e) {
      this.message('Channel settle failed');
    }
  }
}
</script>

<style scoped lang="scss">
.channels__expanded-area {
  background-color: #323232;
  height: 250px;

  .channels__area-content {
    padding: 20px;
  }

  position: relative;
  z-index: 20;
}

.channel {
  background-color: #141414;
  box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);
}

.channel .channels__partner-address {
  font-size: 16px;
  line-height: 20px;
}

.channel .channels__state-info {
  color: #696969 !important;
  font-size: 16px;
  line-height: 20px;
}

.channels {
  background-color: transparent !important;
  padding-bottom: 0;
  padding-top: 0;
}

.channels /deep/ .v-list__tile {
  height: 105px;
}

.channels__lifecycle {
  margin-bottom: 30px;
}

.channels__icon {
  padding-left: 10px;
  margin-right: 15px;
}
</style>
