<template>
  <v-divider
    class="stepper-divider"
    :class="{
      'stepper-divider--active': active,
      'stepper-divider--skipped': skipped,
    }"
  />
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component
export default class StepperStep extends Vue {
  @Prop({ type: Boolean, required: false, default: false })
  active!: boolean;

  @Prop({ type: Boolean, required: false, default: false })
  skipped!: boolean;
}
</script>

<style lang="scss" scoped>
@import '@/scss/colors';

.stepper-divider {
  border: 1px solid #646464 !important;

  &.active {
    border-color: $primary-color !important;
  }

  &.skipped {
    border-color: $secondary-text-color !important;
  }
}
</style>
