<template>
  <blurred-overlay :show="visible" fullscreen>
    <v-dialog
      :value="visible"
      width="350"
      hide-overlay
      dark
      :persistent="hideClose"
      @click:outside="close()"
    >
      <v-card class="raiden-dialog">
        <v-btn
          v-if="!hideClose"
          icon
          class="raiden-dialog__close"
          @click="close()"
        >
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
  @Prop({ required: true, default: false, type: Boolean })
  visible!: boolean;
  @Prop({ required: false, default: false, type: Boolean })
  hideClose!: boolean;

  @Emit()
  close() {}
}
</script>

<style scoped lang="scss">
@import '../scss/colors';
::v-deep {
  .v-dialog {
    border-radius: 10px !important;
  }
}

.raiden-dialog {
  background-color: $card-background;
  display: flex;
  flex-direction: column;
  justify-content: center;
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

      &__actions {
        margin: 20px 0 35px 0;
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
</style>
