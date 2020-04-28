<template>
  <div class="channels">
    <list-header
      v-if="open.length > 0"
      :header="$t('channels.open.header')"
      class="channels__header"
    ></list-header>
    <div class="channels__wrapper">
      <channel-list
        v-if="open.length > 0"
        :token="token"
        :channels="open"
        :expanded="expanded"
        @action="onAction"
        @expand="channelSelected($event)"
      ></channel-list>
      <list-header
        v-if="closed.length > 0"
        :header="$t('channels.closed.header')"
        class="channels__header"
      ></list-header>
      <channel-list
        v-if="closed.length > 0"
        :token="token"
        :channels="closed"
        :expanded="expanded"
        @action="onAction"
        @expand="channelSelected($event)"
      ></channel-list>
      <list-header
        v-if="settleable.length > 0"
        :header="$t('channels.settleable.header')"
        class="channels__header"
      ></list-header>
      <channel-list
        v-if="settleable.length > 0"
        :token="token"
        :channels="settleable"
        :expanded="expanded"
        @action="onAction"
        @expand="channelSelected($event)"
      ></channel-list>
    </div>
    <v-snackbar v-model="snackbar" :multi-line="true" :timeout="3000" bottom>
      {{ message }}
      <v-btn color="primary" text @click="snackbar = false">
        {{ $t('channels.snackbar-close') }}
      </v-btn>
    </v-snackbar>
    <channel-dialogs
      v-if="!!selectedChannel && !!action"
      :action="action"
      :channel="selectedChannel"
      @dismiss="action = null"
      @message="showMessage($event)"
    ></channel-dialogs>
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
import ChannelDialogs from '@/components/ChannelDialogs.vue';
import { ChannelAction } from '@/types';

@Component({
  components: { ChannelDialogs, ListHeader, ChannelList },
  computed: {
    ...mapGetters(['channels'])
  }
})
export default class Channels extends Mixins(NavigationMixin) {
  message: string = '';
  snackbar: boolean = false;
  channels!: (address: string) => RaidenChannel[];
  action: ChannelAction | null = null;

  selectedChannel: RaidenChannel | null = null;
  expanded: { [id: number]: boolean } = {};

  channelSelected(payload: { channel: RaidenChannel; expanded: boolean }) {
    const { expanded, channel } = payload;
    if (expanded) {
      this.selectedChannel = channel;
      this.expanded = { [channel.id ?? -1]: true };
    } else {
      this.selectedChannel = null;
      const updates = { ...this.expanded };
      for (const key in updates) {
        updates[key] = false;
      }
      this.expanded = updates;
    }
  }

  onAction(action: ChannelAction) {
    const channel = this.selectedChannel;
    /* istanbul ignore if */
    if (!channel) {
      return;
    }
    this.action = action;
  }

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

  /* istanbul ignore next */
  showMessage(message: string) {
    this.message = message;
    this.snackbar = true;
  }
}
</script>

<style lang="scss" scoped>
@import '../../scss/dimensions';
@import '../../scss/scroll';

.channels {
  width: 100%;
  height: 100%;
  overflow: hidden;

  &:first-child {
    padding-top: 50px;
  }

  &__overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(30, 30, 30, 0.75);
    z-index: 10;
  }

  &__wrapper {
    height: 100%;
    width: 100%;
    overflow-y: auto;
    @extend .themed-scrollbar;
  }

  &__header {
    padding-top: $list-header-padding-top;
  }
}
</style>
