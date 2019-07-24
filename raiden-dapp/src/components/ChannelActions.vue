<template>
  <v-layout justify-space-around row>
    <v-btn
      :id="`deposit-${index}`"
      :disabled="channel.state !== 'open'"
      class="action-button text-capitalize action-button__primary"
      @click="$emit('deposit', channel)"
    >
      Deposit
    </v-btn>
    <v-btn
      :id="`close-${index}`"
      :disabled="channel.state !== 'open' && channel.state !== 'closing'"
      class="action-button text-capitalize action-button__secondary"
      @click="$emit('close', channel)"
    >
      Close
    </v-btn>
    <v-btn
      :id="`settle-${index}`"
      class="action-button text-capitalize action-button__secondary"
      :disabled="channel.state !== 'settleable' && channel.state !== 'settling'"
      @click="$emit('settle', channel)"
    >
      Settle
    </v-btn>
  </v-layout>
</template>
<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';
import { RaidenChannel } from 'raiden';

@Component({})
export default class ChannelActions extends Vue {
  @Prop({ required: true })
  index!: number;
  @Prop({})
  channel!: RaidenChannel;
}
</script>
<style lang="scss" scoped>
@import '../main';
@import '../scss/colors';

.action-button {
  width: 135px;
  border-radius: 29px;
}
.action-button__primary {
  background-color: $primary-color !important;
}
.action-button__secondary {
  border: 2px solid $primary-color;
  background-color: $secondary-button-color !important;
}

.action-button__secondary.theme--dark.v-btn.v-btn--disabled:not(.v-btn--icon):not(.v-btn--flat):not(.v-btn--outline) {
  background-color: transparent !important;
}

.action-button__primary.theme--dark.v-btn.v-btn--disabled:not(.v-btn--icon):not(.v-btn--flat):not(.v-btn--outline) {
  background-color: $primary-disabled-color !important;
}

.action-button__secondary.v-btn--disabled {
  border-color: $primary-disabled-color;
}
</style>
