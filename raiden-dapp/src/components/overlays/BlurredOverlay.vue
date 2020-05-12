<template>
  <div v-if="show" class="blurred-overlay" :class="{ fullscreen: fullscreen }">
    <slot></slot>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class BlurredOverlay extends Vue {
  @Prop({ type: Boolean, required: true })
  show!: boolean;
  @Prop({ required: false, default: false, type: Boolean })
  fullscreen!: boolean;
}
</script>

<style scoped lang="scss">
@import '@/scss/colors';

.blurred-overlay {
  background-color: rgba($color-white, 0.05);
  backdrop-filter: blur(3px);
  border-radius: 10px;
  bottom: 0;
  left: 0;
  margin-top: -120px;
  position: absolute;
  right: 0;
  top: 0;

  &.fullscreen {
    border-radius: 0;
    margin-top: 0;
    position: fixed;
    z-index: 101;
  }
}
</style>
