<template>
  <transfer-steps></transfer-steps>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import TransferSteps from '@/components/navigation/TransferSteps.vue';

@Component({
  components: { TransferSteps },
})
export default class TransferStepsRoute extends Vue {}
</script>

<style scoped></style>
