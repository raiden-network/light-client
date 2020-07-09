<template>
  <lazy-route>
    <select-hub></select-hub>
  </lazy-route>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import SelectHub from '../components/navigation/SelectHub.vue';
import LazyRoute from '@/views/LazyRoute.vue';

@Component({
  components: { LazyRoute, SelectHub },
})
export default class SelectHubRoute extends Vue {}
</script>

<style scoped></style>
