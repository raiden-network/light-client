<template>
  <v-row justify="space-around" class="channel-actions">
    <v-btn
      :id="`deposit-${index}`"
      :disabled="channel.state !== 'open'"
      class="channel-action__button text-capitalize channel-action__button__primary"
      @click="$emit('deposit', channel)"
    >
      {{ $t('channel-actions.deposit') }}
    </v-btn>
    <v-btn
      :id="`close-${index}`"
      :disabled="channel.state !== 'open' && channel.state !== 'closing'"
      class="channel-action__button text-capitalize channel-action__button__secondary"
      @click="$emit('close', channel)"
    >
      {{ $t('channel-actions.close') }}
    </v-btn>
    <v-btn
      :id="`settle-${index}`"
      :disabled="channel.state !== 'settleable' && channel.state !== 'settling'"
      class="channel-action__button text-capitalize channel-action__button__secondary"
      @click="$emit('settle', channel)"
    >
      {{ $t('channel-actions.settle') }}
    </v-btn>
  </v-row>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { RaidenChannel } from 'raiden-ts';

@Component({})
export default class ChannelActions extends Vue {
  @Prop({ required: true })
  index!: number;
  @Prop({})
  channel!: RaidenChannel;
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
