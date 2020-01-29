<template>
  <blurred-overlay :show="visible" :fullscreen="fullscreen">
    <v-dialog :value="visible" width="350" hide-overlay="true">
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
  @Prop({ required: false, default: true })
  fullscreen!: boolean;

  @Emit()
  close() {}
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
.raiden-dialog {
  background-color: $card-background;
  height: 441px;
  padding: 25px;

  ::v-deep {
    .v-card {
      &__title {
        color: $color-white;
        font-family: Roboto, sans-serif;
        font-size: 20px;
        font-weight: 700;
        line-height: 28px;
        justify-content: center;
        text-align: center;
      }

      &__text {
        padding-top: 10px;
        text-align: center;
        color: $color-white;
      }
    }
  }

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
