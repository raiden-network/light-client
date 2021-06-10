<template>
  <div fluid data-cy="home" class="home">
    <v-row no-gutters>
      <v-col cols="12">
        <div class="home__logo-container">
          <v-img
            :src="require('@/assets/logo.svg')"
            aspect-ratio="1"
            class="home__logo-container__logo"
            contain
          />
        </div>
      </v-col>
    </v-row>

    <v-row no-gutters>
      <v-col cols="12">
        <div class="home__app-welcome text-center">
          {{ $t('home.welcome') }}
        </div>
      </v-col>
    </v-row>

    <v-row no-gutters>
      <v-col cols="12">
        <div class="home__disclaimer text-center font-weight-light">
          {{ $t('home.disclaimer') }}
        </div>
        <i18n
          path="home.getting-started.description"
          tag="div"
          class="home__getting-started text-center font-weight-light"
        >
          <a href="https://github.com/raiden-network/light-client#getting-started" target="_blank">
            {{ $t('home.getting-started.link-name') }}
          </a>
        </i18n>
      </v-col>
    </v-row>

    <v-row no-gutters>
      <v-col cols="12" class="mt-10">
        <connection-manager />
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import type { Location } from 'vue-router';
import { mapState } from 'vuex';

import ConnectionManager from '@/components/ConnectionManager.vue';
import { RouteNames } from '@/router/route-names';

@Component({
  computed: {
    ...mapState(['isConnected']),
  },
  components: {
    ConnectionManager,
  },
})
export default class Home extends Vue {
  isConnected!: boolean;

  get navigationTarget(): Location {
    const redirectTo = this.$route.query.redirectTo as string;

    if (redirectTo) {
      return { path: redirectTo };
    } else {
      return { name: RouteNames.TRANSFER };
    }
  }

  @Watch('isConnected', { immediate: true })
  onConnectionEstablished(value: boolean): void {
    if (value) {
      this.$router.push(this.navigationTarget);
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/mixins';

.home {
  width: 100%;
  height: 100% !important;

  @include respond-to(handhelds) {
    padding: 0 10px;
    overflow-y: auto !important;
  }

  ::v-deep {
    a {
      text-decoration: none;
    }
  }

  &__logo-container {
    display: flex;
    justify-content: center;

    &__logo {
      filter: invert(100%);
      max-width: 6rem;
    }
  }

  &__app-welcome {
    font-size: 24px;
    margin-top: 60px;
  }

  &__disclaimer,
  &__getting-started {
    font-size: 16px;
    line-height: 20px;
    margin: 30px 130px 0 130px;

    @include respond-to(handhelds) {
      margin: 30px 20px 0 20px;
    }
  }

  &__getting-started {
    margin-top: 20px;
  }
}
</style>
