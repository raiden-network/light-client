<template>
  <lazy-route>
    <open-channel></open-channel>
  </lazy-route>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import OpenChannel from '../components/navigation/OpenChannel.vue';
import LazyRoute from '@/views/LazyRoute.vue';

@Component({
  components: { LazyRoute, OpenChannel }
})
export default class OpenChannelRoute extends Vue {}
</script>

<style scoped></style>
