<template>
  <v-layout class="channel-list">
    <v-flex xs12>
      <v-list class="channel-list__channels">
        <v-list-group
          v-for="(channel, index) in channels"
          :key="channel.partner"
          class="channel-list__channels__channel"
          no-action
        >
          <template #activator>
            <v-list-item :id="`channel-${channel.id}`">
              <v-list-item-avatar class="channel-list__channels__channel__icon">
                <img
                  :src="$blockie(channel.partner)"
                  :alt="$t('channel-list.channel.blockie_alt')"
                  class="indenticon"
                />
              </v-list-item-avatar>
              <v-list-item-content>
                <v-list-item-title
                  class="channel-list__channels__channel__partner-address"
                >
                  {{ channel.partner }}
                </v-list-item-title>
                <v-list-item-subtitle
                  class="channel-list__channels__channel__state-info"
                >
                  {{
                    $t('channel-list.channel.state', {
                      deposit: displayFormat(
                        channel.ownDeposit,
                        token.decimals
                      ),
                      state: capitalizeFirst(channel.state)
                    })
                  }}
                </v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
          </template>
          <div
            :id="`expanded-area-${index}`"
            class="channel-list__channels__channel__expanded-area"
          >
            <div v-if="visible === `channel-${channel.id}-close`">
              <confirmation
                :identifier="channel.id"
                :positive-action="$t('confirmation.buttons.close')"
                @confirm="close()"
                @cancel="dismiss()"
              >
                <template #header>
                  {{ $t('channel-list.channel.close_dialog.title') }}
                </template>

                {{ $t('channel-list.channel.close_dialog.description') }}
              </confirmation>
            </div>
            <div v-else-if="visible === `channel-${channel.id}-settle`">
              <confirmation
                :identifier="channel.id"
                :positive-action="$t('confirmation.buttons.settle')"
                @confirm="settle()"
                @cancel="dismiss()"
              >
                <template #header>
                  {{ $t('channel-list.channel.settle_dialog.title') }}
                </template>
                {{
                  $t('channel-list.channel.settle_dialog.description', {
                    partner: selectedChannel.partner,
                    token: selectedChannel.token
                  })
                }}
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
            <div v-else class="channel-list__channels__channel__area-content">
              <channel-life-cycle
                :state="channel.state"
                class="channel-list__channels__channel__lifecycle"
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
import { RaidenChannel } from 'raiden-ts';
import { Token, TokenPlaceholder } from '@/model/types';
import ChannelActions from '@/components/ChannelActions.vue';
import ChannelLifeCycle from '@/components/ChannelLifeCycle.vue';
import ChannelDeposit from '@/components/ChannelDeposit.vue';
import Confirmation from '@/components/Confirmation.vue';
import { BigNumber } from 'ethers/utils';
import BlockieMixin from '@/mixins/blockie-mixin';
import Filters from '@/filters';

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

  displayFormat = Filters.displayFormat;
  capitalizeFirst = Filters.capitalizeFirst;

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
      this.message(this.$t('channel-list.messages.deposit.success') as string);
    } catch (e) {
      this.message(this.$t('channel-list.messages.deposit.failure') as string);
    }
  }

  async close() {
    const { token, partner } = this.selectedChannel!;
    this.dismiss();
    try {
      await this.$raiden.closeChannel(token, partner);
      this.message(this.$t('channel-list.messages.close.success') as string);
    } catch (e) {
      this.message(this.$t('channel-list.messages.close.failure') as string);
    }
  }

  async settle() {
    const { token, partner } = this.selectedChannel!;
    this.dismiss();
    try {
      await this.$raiden.settleChannel(token, partner);
      this.message(this.$t('channel-list.messages.settle.success') as string);
    } catch (e) {
      this.message(this.$t('channel-list.messages.settle.failure') as string);
    }
  }
}
</script>

<style scoped lang="scss">
.channel-list__channels__channel__expanded-area {
  background-color: #323232;
  height: 250px;

  .channel-list__channels__channel__area-content {
    padding: 20px;
  }

  position: relative;
  z-index: 20;
}

.channel-list__channels__channel {
  background-color: #141414;
  box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);
}

.channel-list__channels__channel__partner-address {
  font-size: 16px;
  line-height: 20px;
}

.channel-list__channels__channel__state-info {
  color: #696969 !important;
  font-size: 16px;
  line-height: 20px;
}

.channel-list__channels {
  background-color: transparent !important;
  padding-bottom: 0;
  padding-top: 0;
}

.channel-list__channels__channel ::v-deep .v-list-item {
  height: 105px;
}

.channel-list__channels__channel__lifecycle {
  margin-bottom: 30px;
}

.channel-list__channels__channel__icon {
  padding-left: 10px;
  margin-right: 15px;
}
</style>
