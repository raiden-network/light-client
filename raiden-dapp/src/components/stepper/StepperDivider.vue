<template>
  <v-divider class="stepper-divider" :class="{ 'stepper-divider--active': active }" />
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class StepperDivider extends Vue {
  @Prop({ type: Boolean, required: false, default: false })
  active!: boolean;
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';

.stepper-divider {
  border: 1px solid #646464 !important;

  &--active {
    border-color: $primary-color !important;
  }
}
</style>
