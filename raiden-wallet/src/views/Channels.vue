<template>
  <div class="content-host">
    <channel-list
      :channels="channels($route.params.token)"
      :token-address="$route.params.token"
    ></channel-list>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import ChannelList from '@/components/ChannelList.vue';
import { mapGetters } from 'vuex';
import { RaidenChannels } from 'raiden';

@Component({
  components: { ChannelList },
  computed: mapGetters(['channels'])
})
export default class Channels extends Vue {
  channels!: (address: string) => RaidenChannels[];
}
</script>

<style lang="scss" scoped></style>
