<template>
  <lazy-route>
    <select-token></select-token>
  </lazy-route>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import SelectToken from '../components/navigation/SelectToken.vue';
import LazyRoute from '@/views/LazyRoute.vue';

@Component({
  components: { LazyRoute, SelectToken }
})
export default class TransferStepsRoute extends Vue {}
</script>

<style scoped></style>
