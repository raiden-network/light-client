<template>
  <div class="info-overlay">
    <div class="info-overlay__content">
      <div class="info-overlay__content__header">
        <header-content disable-back-button disable-info-button />
      </div>
      <div class="info-overlay__content__close-icon">
        <v-icon icon @click="closeOverlay()">mdi-close</v-icon>
      </div>
      <div class="info-overlay__content__image">
        <img :src="require(`@/assets/info-overlay/${$route.meta.infoOverlay.headerImage}`)" />
      </div>
      <span class="info-overlay__content__title">{{ $t($route.meta.infoOverlay.header) }}</span>
      <span class="info-overlay__content__body">{{ $t($route.meta.infoOverlay.body) }}</span>
      <div class="info-overlay__content__button">
        <action-button enabled :text="$t('info-overlay.done')" @click="closeOverlay()" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';

import ActionButton from '@/components/ActionButton.vue';
import HeaderContent from '@/components/HeaderContent.vue';

@Component({
  components: {
    HeaderContent,
    ActionButton,
  },
})
export default class InfoOverlay extends Vue {
  @Emit()
  closeOverlay(): void {
    // pass
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/dimensions';
@import '@/scss/mixins';
@import '@/scss/colors';

.info-overlay {
  background-color: $transfer-screen-bg-color;
  border-radius: 10px;
  height: 844px;
  position: absolute;
  width: 100%;
  z-index: 102;

  @include respond-to(handhelds) {
    border-radius: 0;
    height: 100vh;
    overflow-y: auto;
  }

  &__content {
    align-items: center;
    display: flex;
    flex-direction: column;
    height: 100%;
    @include respond-to(handhelds) {
      margin-top: $ios-safe-area;
    }

    &__header {
      display: flex;
      height: 80px;
      width: 100%;
      @include respond-to(handhelds) {
        height: 60px;
      }
    }

    &__close-icon {
      display: flex;
      justify-content: flex-end;
      padding-right: 36px;
      width: 100%;
    }

    &__image {
      padding-top: 46px;
      height: auto;
      width: 300px;
    }

    &__title {
      font-size: 24px;
      margin: 36px 0;
      text-align: center;
    }

    &__body {
      font-size: 19px;
      text-align: center;
      margin: 0 36px;
    }

    &__button {
      align-items: flex-end;
      display: flex;
      flex: 1;
      margin-bottom: 98px;
      width: 100%;
      @include respond-to(handhelds) {
        padding: 36px 0;
      }
    }
  }
}
</style>
