<template>
  <div id="account-route-wrapper">
    <div class="account-route">
      <info-overlay v-if="showInfoOverlay" @close-overlay="showInfoOverlay = false" />
      <div class="account-route__header">
        <header-content @show-info="showInfoOverlay = true" @navigate-back="navigateBack()" />
      </div>
      <v-main>
        <router-view />

        <div v-if="version" class="account-route__footer">
          <span>{{ $t('versions.sdk', { version }) }}</span>
          <span class="account-route__footer__contracts-version">
            {{ $t('versions.contracts', { version: contractVersion }) }}
          </span>
        </div>
      </v-main>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';

import { Raiden } from 'raiden-ts';

import HeaderContent from '@/components/HeaderContent.vue';
import InfoOverlay from '@/components/overlays/InfoOverlay.vue';
import NavigationMixin from '@/mixins/navigation-mixin';

@Component({
  components: {
    InfoOverlay,
    HeaderContent,
  },
})
export default class AccountRoute extends Mixins(NavigationMixin) {
  showInfoOverlay = false;

  navigateBack(): void {
    this.onModalBackClicked();
  }

  get version(): string {
    return Raiden.version;
  }

  get contractVersion(): string {
    return Raiden.contractVersion;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/mixins';
@import '@/scss/colors';
@import '@/scss/scroll';

#account-route-wrapper {
  align-items: center;
  display: flex;
  height: 100%;
  position: absolute;
  z-index: 20;

  @include respond-to(handhelds) {
    height: 100vh;
    width: 100%;
  }
}

.account-route {
  background: $card-background;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  height: 844px;
  margin-top: 25px;
  width: 620px;
  overflow-y: auto;
  @extend .themed-scrollbar;

  @include respond-to(handhelds) {
    border-radius: 0;
    height: 100vh;
    margin-top: 0;
    width: 100%;
  }

  &__header {
    display: flex;
    height: 80px;
  }

  &__footer {
    align-items: flex-end;
    color: $secondary-button-color;
    display: flex;
    flex: 1;
    font-size: 13px;
    justify-content: center;
    padding-bottom: 25px;
    text-align: center;

    &__contracts-version {
      padding-left: 15px;
    }
  }
}
</style>
