<template>
  <v-layout justify-space-around row>
    <v-btn
      :id="`deposit-${index}`"
      :disabled="channel.state !== 'open'"
      class="action-button text-capitalize"
      @click="$emit('deposit', channel)"
    >
      Deposit
    </v-btn>
    <v-btn
      :id="`close-${index}`"
      :disabled="channel.state !== 'open' && channel.state !== 'closing'"
      class="action-button text-capitalize"
      @click="$emit('close', channel)"
    >
      Close
    </v-btn>
    <v-btn
      :id="`settle-${index}`"
      class="action-button text-capitalize"
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

.action-button {
  width: 135px;
  border-radius: 29px;
  background-color: #000000;
}
</style>
