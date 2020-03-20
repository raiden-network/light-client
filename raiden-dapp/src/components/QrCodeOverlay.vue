<template>
  <v-overlay :value="visible" absolute opacity="1.0" class="scanner__wrapper">
    <v-btn icon class="scanner__close-button" @click="cancel">
      <v-icon>mdi-close</v-icon>
    </v-btn>
    <v-row
      v-if="showPermissionHint"
      justify="center"
      align-content="center"
      class="fill-height"
    >
      <v-progress-circular
        :size="125"
        :width="4"
        color="primary"
        indeterminate
        class="scanner__progress"
      />
      <h2>{{ $t('scan.permission.title') }}</h2>
      <p>{{ $t('scan.permission.description') }}</p>
    </v-row>
    <v-row
      v-if="error"
      justify="center"
      align-content="center"
      class="fill-height"
    >
      <v-col cols="8">
        <error-message error="" />
      </v-col>
    </v-row>
    <qrcode-stream @init="onInit" @decode="decode" />
  </v-overlay>
</template>

<script lang="ts">
import { Component, Prop, Emit, Vue } from 'vue-property-decorator';
import { QrcodeStream } from 'vue-qrcode-reader';

import ErrorMessage from '@/components/ErrorMessage.vue';

@Component({ components: { QrcodeStream, ErrorMessage } })
export default class QrCodeOverlay extends Vue {
  @Prop({ required: true, type: Boolean, default: false })
  visible!: boolean;

  showPermissionHint: boolean = false;
  error: Error | null = null;

  async onInit(promise: Promise<any>) {
    this.showPermissionHint = true;

    try {
      await promise;
    } catch (error) {
      this.error = error;
    } finally {
      this.showPermissionHint = false;
    }
  }

  @Emit()
  decode() {}

  @Emit()
  cancel() {}
}
</script>

<style lang="scss" scoped>
@import '../scss/mixins';

.scanner {
  &__close-button {
    position: absolute;
    margin: 15px;
    z-index: 1;
    right: 0;

    @include respond-to(handhelds) {
      bottom: 0;
    }
  }

  &__wrapper {
    position: absolute;
    display: block;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;

    @include respond-to(handhelds) {
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }

    ::v-deep {
      .v-overlay {
        &__content {
          position: absolute;
          top: 0;
          right: 0;
          width: 100%;
          height: 100%;
        }
      }
    }
  }

  &__progress {
    display: block;
    margin-bottom: 25px;
    width: 100% !important;
  }

  &__video {
    position: relative;
    display: block;
    height: 100%;
  }
}
</style>
