<template>
  <div v-if="show" class="blurred-overlay" />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class BlurredOverlay extends Vue {
  @Prop({ type: Boolean, required: true })
  show!: boolean;
}
</script>

<style scoped lang="scss">
@import '../scss/colors';

.blurred-overlay {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  backdrop-filter: blur(4px);
  background-color: rgba($color-white, 0.15);
}
</style>
