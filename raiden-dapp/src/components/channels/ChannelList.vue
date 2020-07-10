<template>
  <v-row class="channel-list" no-gutters>
    <v-col cols="12">
      <v-list class="channel-list__channels" flat>
        <v-list-item
          v-for="channel in channels"
          :key="channel.partner"
          class="channel-list__channels__channel"
        >
          <v-list-item-avatar class="channel-list__channels__channel__icon">
            <img
              :src="$blockie(channel.partner)"
              :alt="$t('channel-list.channel.blockie_alt')"
              class="indenticon"
            />
          </v-list-item-avatar>
          <v-list-item-content class="channel-list__channels__channel__content">
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
                  value: displayFormat(channel.capacity, token.decimals || 0),
                  state: capitalizeFirst(channel.state),
                })
              }}
            </v-list-item-subtitle>
          </v-list-item-content>
          <v-list-item-icon class="channel-action channel-action-inline">
            <v-btn
              :id="`deposit-${channel.id}`"
              text
              class="channel-action-button"
              :disabled="channel.state !== 'open' || busy"
              @click="action(['deposit', channel])"
            >
              <v-img max-width="25px" :src="require('@/assets/deposit.svg')" />
              <span class="action-title">
                {{ $t('channel-actions.deposit') }}
              </span>
            </v-btn>
            <v-btn
              :id="`withdraw-${channel.id}`"
              text
              class="channel-action-button"
              :disabled="channel.state !== 'open' || busy"
              @click="action(['withdraw', channel])"
            >
              <v-img
                max-width="25px"
                :src="require('@/assets/withdrawal.svg')"
              />
              <span class="action-title">
                {{ $t('channel-actions.withdraw') }}
              </span>
            </v-btn>
          </v-list-item-icon>
          <v-list-item-icon class="channel-action">
            <v-btn
              v-if="
                selectedChannel && channel.id === selectedChannel.id && busy
              "
              :id="`busy-${channel.id}`"
              disabled
              class="channel-action__button text-capitalize channel-action__button__secondary"
            >
              <spinner :size="28" :width="4" />
            </v-btn>
            <v-btn
              v-else-if="
                channel.state === 'open' || channel.state === 'closing'
              "
              :id="`close-${channel.id}`"
              :disabled="busy"
              class="channel-action__button text-capitalize channel-action__button__secondary"
              @click="action(['close', channel])"
            >
              {{ $t('channel-actions.close') }}
            </v-btn>
            <v-btn
              v-else
              :id="`settle-${channel.id}`"
              :disabled="channel.state === 'closed' || busy"
              class="channel-action__button text-capitalize channel-action__button__primary"
              @click="action(['settle', channel])"
            >
              {{
                channel.state === 'closed'
                  ? channel.closeBlock + channel.settleTimeout - blockNumber + 1
                  : $t('channel-actions.settle')
              }}
            </v-btn>
          </v-list-item-icon>
        </v-list-item>
      </v-list>
    </v-col>
  </v-row>
</template>

<script lang="ts">
import { Component, Mixins, Prop, Emit } from 'vue-property-decorator';
import { mapState } from 'vuex';
import { RaidenChannel } from 'raiden-ts';
import { Token } from '@/model/types';
import AddressDisplay from '@/components/AddressDisplay.vue';
import Spinner from '@/components/icons/Spinner.vue';
import BlockieMixin from '@/mixins/blockie-mixin';
import Filters from '@/filters';
import { ChannelAction } from '@/types';

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
  @Prop({ default: false })
  busy!: boolean;

  @Emit()
  action(_action: [ChannelAction, RaidenChannel]) {}
}
</script>

<style scoped lang="scss">
@import '@/scss/mixins';
@import '@/scss/colors';

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
      height: 105px;
      padding-left: 32px;

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

      &__content {
        overflow: initial;
      }
    }
  }
}

.channel-action {
  align-self: center;

  &__button {
    width: 85px;
    border-radius: 29px;

    &__secondary {
      &:not([disabled]) {
        border: 2px solid $primary-color;
      }
    }

    &__primary {
      background-color: $primary-color !important;
    }
  }

  &.channel-action-inline {
    flex: 1 1;

    .channel-action-button {
      margin: 0 4px;
      justify-content: left;
      padding: 0 8px;
      border-radius: 29px;
      min-width: unset;
      text-transform: unset;

      span {
        &.action-title {
          max-width: 0;
          display: inline-flex;
          white-space: nowrap;
          transition: max-width 0.5s, padding 0.45s;
          overflow: hidden;
          padding-left: 0px;
        }
      }

      &:hover,
      &:focus {
        span {
          &.action-title {
            max-width: 100px;
            padding: 0 5px;
          }
        }
      }

      &[disabled] {
        filter: saturate(0);
      }
    }
  }
}
</style>
