<template>
  <div class="info-overlay">
    <div class="info-overlay__header">
      <header-content disable-back-button disable-info-button />
    </div>
    <div class="info-overlay__close-icon">
      <v-icon icon @click="closeOverlay()"> mdi-close </v-icon>
    </div>
    <div class="info-overlay__image">
      <img :src="require(`@/assets/info-overlay/${$route.meta.infoOverlay.headerImage}`)" />
    </div>
    <span class="info-overlay__title">{{ $t($route.meta.infoOverlay.header) }}</span>
    <span class="info-overlay__body">{{ $t($route.meta.infoOverlay.body) }}</span>
    <div class="info-overlay__button">
      <action-button enabled :text="$t('info-overlay.done')" @click="closeOverlay()" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Emit, Vue } from 'vue-property-decorator';
import HeaderContent from '@/components/HeaderContent.vue';
import ActionButton from '@/components/ActionButton.vue';

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
@import '@/scss/mixins';
@import '@/scss/colors';

.info-overlay {
  align-items: center;
  background-color: $transfer-screen-bg-color;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  height: calc(844px);
  padding: 0 46px;
  position: absolute;
  width: 100%;
  z-index: 102;
  @include respond-to(handhelds) {
    border-radius: 0;
    height: 100vh;
  }

  &__header {
    display: flex;
    height: 80px;
    width: 100%;
  }

  &__close-icon {
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }

  &__image {
    margin-top: 46px;
    height: auto;
    width: 300px;
  }

  &__title {
    color: $color-gray;
    font-size: 24px;
    margin: 36px 0;
  }

  &__body {
    font-size: 19px;
    text-align: center;
  }

  &__button {
    align-items: flex-end;
    display: flex;
    flex: 1;
    margin-bottom: 98px;
    width: 100%;
  }
}
</style>
