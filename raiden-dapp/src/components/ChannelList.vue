<template>
  <v-row class="channel-list" no-gutters>
    <v-col cols="12">
      <v-list class="channel-list__channels">
        <v-list-group
          v-for="(channel, index) in channels"
          :key="channel.partner"
          :value="expanded[channel.id]"
          class="channel-list__channels__channel"
          no-action
          @input="expand({ channel, expanded: $event })"
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
            <div class="channel-list__channels__channel__area-content">
              <channel-life-cycle
                :state="channel.state"
                class="channel-list__channels__channel__lifecycle"
              ></channel-life-cycle>
              <channel-actions
                :index="index"
                :channel="channel"
                @action="action"
              ></channel-actions>
            </div>
          </div>
        </v-list-group>
      </v-list>
    </v-col>
  </v-row>
</template>

<script lang="ts">
import { Component, Emit, Mixins, Prop } from 'vue-property-decorator';
import { RaidenChannel } from 'raiden-ts';
import { Token } from '@/model/types';
import ChannelActions from '@/components/ChannelActions.vue';
import ChannelLifeCycle from '@/components/ChannelLifeCycle.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';
import BlockieMixin from '@/mixins/blockie-mixin';
import Filters from '@/filters';

@Component({
  components: {
    ChannelActions,
    ChannelLifeCycle,
    AddressDisplay
  }
})
export default class ChannelList extends Mixins(BlockieMixin) {
  displayFormat = Filters.displayFormat;
  capitalizeFirst = Filters.capitalizeFirst;

  @Prop({ required: true })
  expanded!: { [id: number]: boolean };
  @Prop({ required: true })
  channels!: RaidenChannel[];
  @Prop({ required: true })
  token!: Token;

  @Emit()
  expand(_payload: { channel: RaidenChannel; expanded: boolean }) {}

  @Emit()
  action(_action: 'deposit' | 'close' | 'settle') {}
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
        margin-right: 15px;
      }
    }
  }
}
</style>
