<template>
  <div class="channels">
    <v-layout justify-center>
      <Transition name="fade-transition" mode="out-in">
        <div
          v-show="visible"
          @click="visible = ''"
          class="channels__overlay"
        ></div>
      </Transition>
    </v-layout>
    <list-header
      v-if="open.length > 0"
      :header="$t('channels.open.header')"
      class="channels__header"
    ></list-header>
    <channel-list
      :visible="visible"
      :token="token"
      :channels="open"
      @visible-changed="visible = $event"
      @message="showMessage($event)"
    ></channel-list>
    <list-header
      v-if="closed.length > 0"
      :header="$t('channels.closed.header')"
      class="channels__header"
    ></list-header>
    <channel-list
      :visible="visible"
      :token="token"
      :channels="closed"
      @visible-changed="visible = $event"
      @message="showMessage($event)"
    ></channel-list>
    <list-header
      v-if="settleable.length > 0"
      :header="$t('channels.settleable.header')"
      class="channels__header"
    ></list-header>
    <channel-list
      :visible="visible"
      :token="token"
      :channels="settleable"
      @visible-changed="visible = $event"
      @message="showMessage($event)"
    ></channel-list>
    <v-snackbar v-model="snackbar" :multi-line="true" :timeout="3000" bottom>
      {{ message }}
      <v-btn @click="snackbar = false" color="primary" text>
        {{ $t('channels.snackbar-close') }}
      </v-btn>
    </v-snackbar>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters } from 'vuex';
import { ChannelState, RaidenChannel } from 'raiden-ts';
import ChannelList from '@/components/ChannelList.vue';
import ListHeader from '@/components/ListHeader.vue';
import { Token } from '@/model/types';
import AddressUtils from '@/utils/address-utils';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
  components: { ListHeader, ChannelList },
  computed: {
    ...mapGetters(['channels'])
  }
})
export default class Channels extends Mixins(NavigationMixin) {
  message: string = '';
  visible: string = '';
  snackbar: boolean = false;

  channels!: (address: string) => RaidenChannel[];

  get open(): RaidenChannel[] {
    return this.channels(this.$route.params.token).filter(
      channel =>
        channel.state === ChannelState.open ||
        channel.state === ChannelState.opening
    );
  }

  get closed(): RaidenChannel[] {
    return this.channels(this.$route.params.token).filter(
      channel =>
        channel.state === ChannelState.closed ||
        channel.state === ChannelState.closing
    );
  }

  get settleable(): RaidenChannel[] {
    return this.channels(this.$route.params.token).filter(
      channel =>
        channel.state === ChannelState.settling ||
        channel.state === ChannelState.settleable
    );
  }

  get token(): Token {
    const { token: address } = this.$route.params;
    return this.$store.state.tokens[address] || ({ address } as Token);
  }

  async created() {
    const { token: address } = this.$route.params;
    if (!AddressUtils.checkAddressChecksum(address)) {
      this.navigateToHome();
      return;
    }

    await this.$raiden.fetchTokenData([address]);

    if (typeof this.token.decimals !== 'number') {
      this.navigateToHome();
    }
  }

  showMessage(message: string) {
    this.message = message;
    this.snackbar = true;
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/dimensions';
.channels__overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(30, 30, 30, 0.75);
  z-index: 10;
}

.channels__header {
  padding-top: $list-header-padding-top;
}

.channels:first-child {
  padding-top: $first-child-padding;
}

.channels {
  width: 100%;
  height: 100%;
}
</style>
