<template>
  <v-row class="app-header" no-gutters>
    <v-col class="app-header__nav-details" cols="8">
      <v-btn
        v-if="canGoBack"
        class="app-header__nav-details__back-button"
        text
        @click="onBackClicked()"
      >
        <v-icon>mdi-chevron-left </v-icon>
        {{ $t('app-header.back-button') }}
      </v-btn>
      <div class="app-header__nav-details__divider"></div>
      <div class="app-header__nav-details__route">
        <span class="app-header__nav-details__route__title">
          {{ $route.meta.title }}
        </span>
        <span
          v-if="!showTitleOnly"
          class="app-header__nav-details__route__network"
        >
          {{ network }}
        </span>
      </div>
    </v-col>
    <v-col cols="4" class="app-header__overlay-routes">
      <span
        v-if="!showTitleOnly"
        class="app-header__overlay-routes__notifications"
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
      <span
        v-if="!isDisclaimerRoute"
        class="app-header__overlay-routes__account"
      >
        <header-identicon @click.native="navigateToAccoount()" />
      </span>
    </v-col>
  </v-row>
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
    ...mapState(['defaultAccount']),
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

  get isDisclaimerRoute(): boolean {
    return this.$route.name! === RouteNames.DISCLAIMER;
  }

  get canGoBack(): boolean {
    const routesWithoutBackBtn: string[] = [
      RouteNames.HOME,
      RouteNames.TRANSFER,
    ];
    return (
      this.isConnected &&
      !this.isDisclaimerRoute &&
      !routesWithoutBackBtn.includes(this.$route.name!)
    );
  }

  get showTitleOnly(): boolean {
    return this.isDisclaimerRoute || !this.isConnected;
  }
}
</script>

<style lang="scss" scoped>
@import '../scss/mixins';
@import '../scss/colors';

.app-header {
  height: 80px;
  padding: 0 36px 0 36px;
  @include respond-to(handhelds) {
    padding: 0 12px 0 12px;
  }

  &__nav-details {
    align-items: center;
    display: flex;

    &__back-button {
      background-color: $input-background;
      margin-right: 10px;
    }

    &__divider {
      background-color: $primary-color;
      border-radius: 6px;
      height: 42px;
      width: 6px;
    }

    &__route {
      display: flex;
      flex-direction: column;
      margin: 0 0 5px 10px;

      &__title {
        flex: none;
        font-size: 24px;
        height: 28px;
      }

      &__network {
        color: $secondary-text-color;
        flex: none;
        font-size: 12px;
      }
    }
  }

  &__overlay-routes {
    align-items: center;
    display: flex;
    justify-content: flex-end;

    &__account {
      cursor: pointer;
      margin-left: 25px;
    }
  }
}
</style>
