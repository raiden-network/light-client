<template>
  <v-row class="channel-list" no-gutters>
    <v-col cols="12">
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
                  <address-display :address="channel.partner" />
                </v-list-item-title>
                <v-list-item-subtitle
                  class="channel-list__channels__channel__state-info"
                >
                  {{
                    $t('channel-list.channel.state', {
                      deposit: displayFormat(
                        channel.ownDeposit,
                        token.decimals || 0
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
              <confirmation-dialog
                :identifier="channel.id"
                :positive-action="$t('confirmation.buttons.close')"
                :visible="closing"
                @confirm="close()"
                @cancel="dismiss()"
              >
                <template #header>
                  {{ $t('channel-list.channel.close_dialog.title') }}
                </template>

                {{ $t('channel-list.channel.close_dialog.description') }}
              </confirmation-dialog>
            </div>
            <div v-else-if="visible === `channel-${channel.id}-settle`">
              <confirmation-dialog
                :identifier="channel.id"
                :positive-action="$t('confirmation.buttons.settle')"
                :visible="settling"
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
              </confirmation-dialog>
            </div>
            <div v-else-if="visible === `channel-${channel.id}-deposit`">
              <channel-deposit-dialog
                :identifier="channel.id"
                :token="token"
                :visible="depositing"
                @confirm="deposit($event)"
                @cancel="dismiss()"
              ></channel-deposit-dialog>
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
    </v-col>
  </v-row>
</template>

<script lang="ts">
import { Component, Emit, Mixins, Prop, Watch } from 'vue-property-decorator';
import { RaidenChannel } from 'raiden-ts';
import { Token } from '@/model/types';
import ChannelActions from '@/components/ChannelActions.vue';
import ChannelLifeCycle from '@/components/ChannelLifeCycle.vue';
import ChannelDepositDialog from '@/components/ChannelDepositDialog.vue';
import ConfirmationDialog from '@/components/ConfirmationDialog.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';
import { BigNumber } from 'ethers/utils';
import BlockieMixin from '@/mixins/blockie-mixin';
import Filters from '@/filters';

@Component({
  components: {
    ChannelActions,
    ChannelLifeCycle,
    ChannelDepositDialog,
    ConfirmationDialog,
    AddressDisplay
  }
})
export default class ChannelList extends Mixins(BlockieMixin) {
  @Prop({ required: true })
  channels!: RaidenChannel[];
  @Prop({ required: true })
  visible!: string;

  @Prop({ required: true })
  token!: Token;
  selectedChannel: RaidenChannel | null = null;

  @Emit()
  message(_message: string) {}

  @Emit()
  visibleChanged(_element: string) {}

  depositing = false;
  closing = false;
  settling = false;
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
    this.depositing = false;
    this.closing = false;
    this.settling = false;
  }

  onDeposit(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visibleChanged(`channel-${channel.id}-deposit`);
    this.depositing = true;
  }

  onClose(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visibleChanged(`channel-${channel.id}-close`);
    this.closing = true;
  }

  onSettle(channel: RaidenChannel) {
    this.selectedChannel = channel;
    this.visibleChanged(`channel-${channel.id}-settle`);
    this.settling = true;
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
::v-deep {
  .v-dialog {
    border-radius: 10px !important;
  }
}

.channel-list {
  &__channels {
    background-color: transparent !important;
    padding-bottom: 0;
    padding-top: 0;

    &__channel {
      $channel: &;
      background-color: #141414;
      box-shadow: inset 0 -2px 0 0 rgba(0, 0, 0, 0.5);

      ::v-deep {
        .v-list-item {
          height: 105px;
        }
      }

      &__expanded-area {
        background-color: #323232;
        height: 250px;

        /* stylelint-disable plugin/stylelint-bem-namics */
        // see https://github.com/namics/stylelint-bem-namics/issues/13
        #{$channel}__area-content {
          padding: 20px;
        }
        /* stylelint-enable plugin/stylelint-bem-namics */

        position: relative;
        z-index: 20;
      }

      &__partner-address {
        font-size: 16px;
        line-height: 20px;
      }

      &__state-info {
        color: #696969 !important;
        font-size: 16px;
        line-height: 20px;
      }

      &__lifecycle {
        margin-bottom: 16px;
      }

      &__icon {
        padding-left: 10px;
        margin-right: 15px;
      }
    }
  }
}
</style>
