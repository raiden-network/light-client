<template>
  <div :class="{ 'spinner--blocking': !inline }">
    <div class="spinner__circle" :style="style" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class Spinner extends Vue {
  @Prop({ type: Boolean, default: false })
  inline!: boolean;

  @Prop({ type: Number, default: 120 })
  size!: number;

  @Prop({ type: Number, default: 7 })
  width!: number;

  get style() {
    return {
      width: `${this.size}px`,
      height: `${this.size}px`,
      borderWidth: `${this.width}px`
    };
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.spinner {
  &--blocking {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  &__circle {
    border: solid transparent;
    border-top: solid $primary-color;
    border-radius: 50%;
    animation: spinning 1s linear infinite;
  }
}

@keyframes spinning {
  0% {
    transform: rotate(0deg);
  }
  60% {
    transform: rotate(270deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
