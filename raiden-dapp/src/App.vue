<template>
  <v-app dark>
    <div id="application-wrapper">
      <router-view name="modal" />
      <div id="application-content">
        <app-header />
        <v-content>
          <v-container fluid class="application__container fill-height">
            <router-view />
          </v-container>
        </v-content>
      </div>
    </div>
    <div class="policy">
      <a href="https://raiden.network/privacy.html" target="_blank">
        {{ $t('application.privacy-policy') }}
      </a>
    </div>
    <offline-snackbar />
    <update-snackbar />
  </v-app>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import AppHeader from '@/components/AppHeader.vue';
import OfflineSnackbar from '@/components/OfflineSnackbar.vue';
import UpdateSnackbar from '@/components/UpdateSnackbar.vue';

@Component({
  components: {
    AppHeader,
    OfflineSnackbar,
    UpdateSnackbar
  }
})
export default class App extends Vue {
  destroyed() {
    this.$raiden.disconnect();
  }
}
</script>

<style lang="scss" scoped>
@import 'scss/mixins';
@import 'scss/colors';

.v-application {
  background: $background-gradient !important;
  @include respond-to(handhelds) {
    background: $card-background !important;
  }
}

#application-wrapper {
  align-items: center;
  display: flex;
  height: 100%;
  justify-content: center;
}

#application-content {
  background-color: $card-background;
  border-radius: 10px;
  height: 844px;
  margin-top: 25px;
  width: 620px;
  @include respond-to(handhelds) {
    border-radius: 0;
    height: 100vh;
    margin-top: 0;
    width: 100%;
  }
}

.v-content {
  height: calc(100% - 120px);
  margin-bottom: auto;
}

.container {
  height: calc(100% - 8px);
  overflow-x: hidden;
  padding: 0 !important;
}

.policy {
  font-size: 13px;
  margin: 15px auto 15px auto;

  a {
    color: $secondary-text-color;
    text-decoration: none;
  }
}
</style>
