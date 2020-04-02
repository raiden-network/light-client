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
            <v-img
              :src="require('../assets/back_arrow.svg')"
              max-width="34px"
            />
          </v-btn>
        </div>
        <div class="general-screen__header__content__title">
          {{ $route.meta.title }}
        </div>
      </div>
    </v-row>
    <router-view />
    <v-row class="general-screen__footer" no-gutters>
      <div v-if="version">
        <span>
          {{ $t('versions.sdk', { version }) }}
        </span>
        <span class="general-screen__footer--contracts-version">
          {{ $t('versions.contracts', { version: contractVersion }) }}
        </span>
      </div>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { Raiden } from 'raiden-ts';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({})
export default class GeneralDialog extends Mixins(NavigationMixin) {
  get version() {
    return Raiden.version;
  }

  get contractVersion() {
    return Raiden.contractVersion;
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/mixins';
@import '../scss/fonts';
@import '../scss/colors';

.general-screen {
  background-color: black;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
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
    flex: none;
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

  &__footer {
    align-items: flex-end;
    color: $secondary-button-color;
    font-size: 13px;
    justify-content: center;
    padding-bottom: 25px;
  }

  &__footer--contracts-version {
    padding-left: 15px;
  }
}
</style>
