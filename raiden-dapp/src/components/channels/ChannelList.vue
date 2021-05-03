<template>
  <v-row data-cy="channel_list" class="channel-list" no-gutters>
    <v-col cols="12">
      <v-list class="channel-list__channels" flat>
        <v-list-item
          v-for="channel in channels"
          :key="channel.partner"
          class="channel-list__channels__channel"
        >
          <v-list-item-avatar>
            <img :src="$blockie(channel.partner)" :alt="$t('channel-list.channel.blockie_alt')" />
          </v-list-item-avatar>
          <v-list-item-content>
            <v-list-item-title>
              <address-display :address="channel.partner" />
            </v-list-item-title>
            <v-list-item-subtitle>
              <span class="channel-list__channels__content__subtitle-desktop">
                {{
                  $t('channel-list.channel.capacity-and-state', {
                    value: displayFormat(channel.capacity, token.decimals || 0),
                    state: capitalizeFirst(channel.state),
                  })
                }}
              </span>
              <div class="channel-list__channels__content__subtitle-mobile">
                <span>
                  {{
                    $t('channel-list.channel.capacity', {
                      value: displayFormat(channel.capacity, token.decimals || 0),
                    })
                  }}
                </span>
                <span>
                  {{
                    $t('channel-list.channel.state', {
                      state: capitalizeFirst(channel.state),
                    })
                  }}
                </span>
              </div>
            </v-list-item-subtitle>
          </v-list-item-content>
          <div class="channel-list__capacity-buttons">
            <v-btn
              :id="`deposit-${channel.id}`"
              :disabled="channel.state !== 'open' || !!busy[channel.id]"
              data-cy="channel_action_button"
              class="channel-list__capacity-buttons__deposit"
              icon
              @click="action(['deposit', channel])"
            >
              <img :src="require('@/assets/deposit.svg')" />
            </v-btn>
            <v-btn
              :id="`withdraw-${channel.id}`"
              :disabled="channel.state !== 'open' || !!busy[channel.id]"
              data-cy="channel_action_button"
              class="channel-list__capacity-buttons__withdrawal"
              icon
              @click="action(['withdraw', channel])"
            >
              <img :src="require('@/assets/withdrawal.svg')" />
            </v-btn>
          </div>
          <div data-cy="channel_action">
            <v-btn
              v-if="selectedChannel && channel.id === selectedChannel.id && !!busy[channel.id]"
              :id="`busy-${channel.id}`"
              disabled
              class="channel-list__action-button"
            >
              <spinner :size="18" :width="2" />
            </v-btn>
            <v-btn
              v-else-if="channel.state === 'open' || channel.state === 'closing'"
              :id="`close-${channel.id}`"
              :disabled="!!busy[channel.id]"
              class="channel-list__action-button"
              @click="action(['close', channel])"
            >
              {{ $t('channel-actions.close') }}
            </v-btn>
            <v-btn
              v-else
              :id="`settle-${channel.id}`"
              :disabled="channel.state === 'closed' || !!busy[channel.id]"
              class="channel-list__action-button"
              @click="action(['settle', channel])"
            >
              {{
                channel.state === 'closed'
                  ? channel.closeBlock + channel.settleTimeout - blockNumber + 1
                  : $t('channel-actions.settle')
              }}
            </v-btn>
          </div>
        </v-list-item>
      </v-list>
    </v-col>
  </v-row>
</template>

<script lang="ts">
import { Component, Emit, Mixins, Prop } from 'vue-property-decorator';
import { mapState } from 'vuex';

import type { RaidenChannel } from 'raiden-ts';

import AddressDisplay from '@/components/AddressDisplay.vue';
import Spinner from '@/components/icons/Spinner.vue';
import Filters from '@/filters';
import BlockieMixin from '@/mixins/blockie-mixin';
import type { Token } from '@/model/types';
import type { ChannelAction } from '@/types';

@Component({
  components: { AddressDisplay, Spinner },
  computed: mapState(['blockNumber']),
})
export default class ChannelList extends Mixins(BlockieMixin) {
  displayFormat = Filters.displayFormat;
  capitalizeFirst = Filters.capitalizeFirst;

  @Prop({ required: true })
  channels!: RaidenChannel[];
  @Prop({ required: true })
  token!: Token;

  @Prop({ default: null })
  selectedChannel!: RaidenChannel | null;
  @Prop()
  busy!: { [key: number]: boolean };

  @Emit()
  action(action: [ChannelAction, RaidenChannel]) {
    return action;
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/mixins';
@import '@/scss/colors';

.channel-list {
  &__channels {
    background-color: transparent !important;

    &__content {
      &__subtitle-desktop {
        @include respond-to(handhelds) {
          display: none;
        }
      }

      &__subtitle-mobile {
        display: none;
        @include respond-to(handhelds) {
          display: flex;
          flex-direction: column;
          font-size: 12px;
        }
      }
    }
  }

  &__capacity-buttons {
    margin-left: 6px;

    &__deposit {
      margin-right: 6px;
      @include respond-to(handhelds) {
        width: 26px;
      }
    }

    &__withdrawal {
      margin-left: 6px;
      @include respond-to(handhelds) {
        width: 26px;
      }
    }
  }

  &__action-button {
    border: 2px solid $primary-color;
    border-radius: 28px;
    font-size: 12px;
    margin-left: 36px;
    width: 85px;
    @include respond-to(handhelds) {
      margin-left: 12px;
      width: 26px;
    }
  }
}
</style>
