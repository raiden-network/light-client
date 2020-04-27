<template>
  <lazy-route>
    <transfer></transfer>
  </lazy-route>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import Transfer from '@/components/navigation/Transfer.vue';
import LazyRoute from '@/views/LazyRoute.vue';

@Component({
  components: { LazyRoute, Transfer }
})
export default class TransferRoute extends Vue {}
</script>

<style scoped></style>
