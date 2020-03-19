<template>
  <div class="scanner__wrapper">
    <div v-if="!stream" class="scanner__grant-permission">
      <h2>{{ $t('scan.permission.title') }}</h2>
      <p>{{ $t('scan.permission.description') }}</p>
    </div>
    <span class="scanner__camera" :class="{ hidden: !stream }">
      <video ref="video" class="scanner__video" />
      <canvas ref="canvas" />
    </span>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import jsQR, { QRCode } from 'jsqr';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({})
export default class Scan extends Mixins(NavigationMixin) {
  video!: HTMLVideoElement;
  frame: number = 0;
  code: QRCode | null = null;
  stream: MediaStream | null = null;

  async mounted() {
    this.video = this.$refs.video as HTMLVideoElement;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: 1280, height: 720 }
      });

      const { video } = this;
      video.srcObject = this.stream;
      video.onloadedmetadata = () => video.play();

      // Scan for QR code
      this.startScanning();
    } catch (e) {
      console.error('No camera access granted.', e);
    }
  }

  startScanning() {
    this.frame = window.requestAnimationFrame(this.tick);
  }

  keepScanning() {
    if (!this.code) {
      this.frame = window.requestAnimationFrame(this.tick);
    }
  }

  stopScanning() {
    window.cancelAnimationFrame(this.frame);
  }

  tick() {
    const { video } = this;
    const canvas = this.$refs.canvas as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    console.log('tick', this.code);
    if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.hidden = true;
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      this.code = jsQR(imageData.data, imageData.width, imageData.height);
      if (this.code) {
        this.stopScanning();
      }
    }

    this.keepScanning();
  }
}
</script>

<style lang="scss" scoped>
.scanner {
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
  }

  &__grant-permission {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }

  &__video {
    position: relative;
    display: block;
    height: 100%;
    left: -50%;
  }
}
</style>
