<template>
  <blurred-overlay :show="visible" :fullscreen="true">
    <v-dialog :value="visible" max-width="425">
      <v-card class="raiden-dialog">
        <v-btn icon class="raiden-dialog__close" @click="close()">
          <v-icon>mdi-close</v-icon>
        </v-btn>
        <slot></slot>
      </v-card>
    </v-dialog>
  </blurred-overlay>
</template>

<script lang="ts">
import BlurredOverlay from '@/components/BlurredOverlay.vue';
import { Component, Emit, Vue, Prop } from 'vue-property-decorator';

@Component({ components: { BlurredOverlay } })
export default class RaidenDialog extends Vue {
  @Prop({ required: true, default: false })
  visible!: boolean;

  @Emit()
  close() {}
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
.raiden-dialog {
  background-color: $card-background;
  padding: 25px;

  &__close {
    position: absolute;
    right: 15px;
    top: 15px;
  }
}

::v-deep .v-dialog {
  border-radius: 10px !important;
}
</style>
