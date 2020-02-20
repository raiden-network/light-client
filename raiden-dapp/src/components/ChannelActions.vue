<template>
  <v-row justify="space-around" class="channel-actions">
    <v-btn
      :id="`deposit-${index}`"
      :disabled="channel.state !== 'open'"
      class="channel-action__button text-capitalize channel-action__button__primary"
      @click="action('deposit')"
    >
      {{ $t('channel-actions.deposit') }}
    </v-btn>
    <v-btn
      :id="`close-${index}`"
      :disabled="channel.state !== 'open' && channel.state !== 'closing'"
      class="channel-action__button text-capitalize channel-action__button__secondary"
      @click="action('close')"
    >
      {{ $t('channel-actions.close') }}
    </v-btn>
    <v-btn
      :id="`settle-${index}`"
      :disabled="channel.state !== 'settleable' && channel.state !== 'settling'"
      class="channel-action__button text-capitalize channel-action__button__secondary"
      @click="action('settle')"
    >
      {{ $t('channel-actions.settle') }}
    </v-btn>
  </v-row>
</template>
<script lang="ts">
import { Component, Emit, Prop, Vue } from 'vue-property-decorator';
import { RaidenChannel } from 'raiden-ts';
import { ChannelAction } from '@/types';

@Component({})
export default class ChannelActions extends Vue {
  @Prop({ required: true })
  index!: number;
  @Prop({})
  channel!: RaidenChannel;
  @Emit()
  action(_action: ChannelAction) {}
}
</script>
<style lang="scss" scoped>
@import '../scss/colors';

.channel-action {
  &__button {
    width: 135px;
    border-radius: 29px;

    &__secondary {
      border: 2px solid $primary-color;
      background-color: $secondary-button-color !important;

      &.theme {
        &--dark {
          &.v-btn {
            &.v-btn {
              &--disabled {
                /* stylelint-disable */
                // can't nest class inside nesting
                &:not(.v-btn--icon) {
                  &:not(.v-btn--text) {
                    &:not(.v-btn--outline) {
                      background-color: transparent !important;
                    }
                  }
                }
                /* stylelint-enable */
              }
            }
          }
        }
      }

      &.v-btn {
        &--disabled {
          border-color: $primary-disabled-color;
        }
      }
    }

    &__primary {
      background-color: $primary-color !important;

      &.theme {
        &--dark {
          &.v-btn {
            &.v-btn {
              &--disabled {
                /* stylelint-disable */
                // can't nest class inside nesting
                &:not(.v-btn--icon) {
                  &:not(.v-btn--text) {
                    &:not(.v-btn--outline) {
                      background-color: $primary-disabled-color !important;
                    }
                  }
                }
                /* stylelint-enable */
              }
            }
          }
        }
      }
    }
  }
}
</style>
