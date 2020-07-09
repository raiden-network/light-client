<template>
  <lazy-route>
    <transfer-steps></transfer-steps>
  </lazy-route>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import LazyRoute from '@/views/LazyRoute.vue';
import TransferSteps from '@/components/navigation/TransferSteps.vue';

@Component({
  components: { TransferSteps, LazyRoute },
})
export default class TransferStepsRoute extends Vue {}
</script>

<style scoped></style>
