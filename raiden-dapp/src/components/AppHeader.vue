<template>
  <div class="app-header">
    <v-row class="app-header__top" justify="center" align="center" no-gutters>
      <v-col cols="12">
        <div class="app-header__top__content">
          <div class="app-header__top__content__back">
            <v-btn
              v-if="canGoBack"
              height="40px"
              width="40px"
              text
              icon
              @click="onBackClicked()"
            >
              <v-img
                :src="require('@/assets/back_arrow.svg')"
                max-width="34px"
              />
            </v-btn>
          </div>
          <v-col>
            <div class="app-header__top__content__title">
              <span v-if="isConnected">
                {{ $route.meta.title }}
              </span>
              <span v-else>
                {{ $t('home.title') }}
              </span>
            </div>
            <div
              v-if="!loading && defaultAccount"
              class="app-header__top__content__network"
            >
              {{ network }}
            </div>
          </v-col>
          <span
            v-if="!loading && defaultAccount"
            class="app-header__notifications-wrapper"
          >
            <v-btn
              icon
              height="30px"
              width="25px"
              @click.native="notificationPanel()"
            >
              <v-badge
                v-if="newNotifications"
                color="notification"
                overlap
                bordered
                dot
              >
                <v-img
                  height="30px"
                  width="25px"
                  :src="require('@/assets/notifications.svg')"
                />
              </v-badge>
              <v-img
                v-else
                height="30px"
                width="25px"
                :src="require('@/assets/notifications.svg')"
              />
            </v-btn>
          </span>
          <span class="app-header__account-wrapper">
            <header-identicon @click.native="navigateToAccoount()" />
          </span>
        </div>
      </v-col>
    </v-row>
    <v-row class="app-header__bottom" align="center" no-gutters>
      <v-col v-if="!loading && defaultAccount" cols="12">
        <div class="app-header__bottom__address text-left">
          <address-display :address="defaultAccount" />
        </div>
      </v-col>
    </v-row>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { createNamespacedHelpers, mapGetters, mapState } from 'vuex';
import { RouteNames } from '@/router/route-names';
import NavigationMixin from '@/mixins/navigation-mixin';
import HeaderIdenticon from '@/components/HeaderIdenticon.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';

const {
  mapState: mapNotificationsState,
  mapMutations,
} = createNamespacedHelpers('notifications');

@Component({
  components: {
    HeaderIdenticon,
    AddressDisplay,
  },
  computed: {
    ...mapState(['loading', 'defaultAccount']),
    ...mapNotificationsState(['newNotifications']),
    ...mapGetters(['network', 'isConnected']),
  },
  methods: {
    ...mapMutations(['notificationsViewed']),
  },
})
export default class AppHeader extends Mixins(NavigationMixin) {
  isConnected!: boolean;
  defaultAccount!: string;
  network!: string;
  newNotifications!: boolean;
  notificationsViewed!: () => void;

  notificationPanel() {
    this.notificationsViewed();
    this.navigateToNotifications();
  }

  get canGoBack(): boolean {
    const routesWithoutBackBtn: string[] = [
      RouteNames.HOME,
      RouteNames.TRANSFER,
    ];
    return (
      this.isConnected && !routesWithoutBackBtn.includes(this.$route.name!)
    );
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/mixins';
@import '../scss/colors';
@import '../scss/fonts';

.app-header {
  &__top {
    background-color: $card-background;
    border-radius: 10px 10px 0 0;
    height: 80px;
    @include respond-to(handhelds) {
      width: 100%;
      border-radius: 0;
    }

    &__content {
      align-items: center;
      display: flex;
      justify-content: center;
      margin: 0 20px 0 40px;

      &__back {
        align-items: center;
        display: flex;
        flex-direction: column;
        height: 36px;
        justify-content: center;
        width: 36px;
      }

      &__title {
        color: $color-white;
        font-family: $main-font;
        font-size: 24px;
        line-height: 28px;
        text-align: center;
      }

      &__network {
        color: $secondary-text-color;
        font-size: 12px;
        font-weight: 500;
        text-align: center;
      }
    }
  }

  &__bottom {
    background-color: $card-background;
    height: 40px;

    &__address {
      align-items: center;
      background-color: $error-tooltip-background;
      display: flex;
      height: 40px;
      padding: 0 20px 0 20px;
    }
  }

  &__notifications-wrapper {
    margin-right: 20px;
    cursor: pointer;
  }

  &__account-wrapper {
    cursor: pointer;
  }
}
</style>
