<template>
  <lazy-route>
    <channels></channels>
  </lazy-route>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Channels from '@/components/navigation/Channels.vue';
import LazyRoute from '@/views/LazyRoute.vue';

@Component({
  components: { LazyRoute, Channels },
})
export default class ChannelsRoute extends Vue {}
</script>

<style scoped></style>
