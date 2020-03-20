<template>
  <div class="general-screen">
    <v-row class="general-screen__header" no-gutters>
      <div class="general-screen__header__content">
        <div class="general-screen__header__content__back">
          <v-btn
            height="40px"
            text
            icon
            width="40px"
            @click="onGeneralBackClicked()"
          >
            <v-img :src="require('../assets/back_arrow.svg')" max-width="34px">
            </v-img>
          </v-btn>
        </div>
        <div class="general-screen__header__content__title">
          {{ $route.meta.title }}
        </div>
      </div>
    </v-row>
    <router-view></router-view>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({})
export default class GeneralDialog extends Mixins(NavigationMixin) {}
</script>

<style scoped lang="scss">
@import '../scss/mixins';
@import '../scss/fonts';

.general-screen {
  background-color: black;
  border-radius: 10px;
  height: 844px;
  margin-top: 12px;
  position: absolute;
  width: 620px;
  z-index: 20;
  @include respond-to(handhelds) {
    border-radius: 0;
    height: 100vh;
    margin-top: 0;
    width: 100%;
  }

  &__header {
    margin-top: 13px;
    width: 620px;
    @include respond-to(handhelds) {
      width: 100%;
    }

    &__content {
      align-items: center;
      display: flex;
      flex: 1;

      &__back {
        margin-left: 18px;
      }

      &__title {
        flex: 1;
        font-family: $main-font;
        font-size: 24px;
        margin-right: 58px;
        padding-bottom: 18px;
        text-align: center;
      }
    }
  }
}
</style>
