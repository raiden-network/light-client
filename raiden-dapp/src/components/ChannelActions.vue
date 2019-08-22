<template>
  <v-layout justify-space-around class="channel-actions">
    <v-btn
      :id="`deposit-${index}`"
      :disabled="channel.state !== 'open'"
      @click="$emit('deposit', channel)"
      class="channel-action__button text-capitalize channel-action__button__primary"
    >
      {{ $t('channel-actions.deposit') }}
    </v-btn>
    <v-btn
      :id="`close-${index}`"
      :disabled="channel.state !== 'open' && channel.state !== 'closing'"
      @click="$emit('close', channel)"
      class="channel-action__button text-capitalize channel-action__button__secondary"
    >
      {{ $t('channel-actions.close') }}
    </v-btn>
    <v-btn
      :id="`settle-${index}`"
      :disabled="channel.state !== 'settleable' && channel.state !== 'settling'"
      @click="$emit('settle', channel)"
      class="channel-action__button text-capitalize channel-action__button__secondary"
    >
      {{ $t('channel-actions.settle') }}
    </v-btn>
  </v-layout>
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

.channel-action__button {
  width: 135px;
  border-radius: 29px;
}
.channel-action__button__primary {
  background-color: $primary-color !important;
}
.channel-action__button__secondary {
  border: 2px solid $primary-color;
  background-color: $secondary-button-color !important;
}

.channel-action__button__secondary.theme--dark.v-btn.v-btn--disabled:not(.v-btn--icon):not(.v-btn--text):not(.v-btn--outline) {
  background-color: transparent !important;
}

.channel-action__button__primary.theme--dark.v-btn.v-btn--disabled:not(.v-btn--icon):not(.v-btn--text):not(.v-btn--outline) {
  background-color: $primary-disabled-color !important;
}

.channel-action__button__secondary.v-btn--disabled {
  border-color: $primary-disabled-color;
}
</style>
