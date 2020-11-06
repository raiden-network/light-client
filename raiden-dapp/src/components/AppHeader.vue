<template>
  <div class="app-header">
    <div class="app-header__back">
      <v-btn
        v-if="canGoBack"
        data-cy="app_header_back_button"
        class="app-header__back-button"
        height="40px"
        width="40px"
        icon
        @click="onBackClicked()"
      >
        <v-img :src="require('@/assets/back_arrow.svg')" />
      </v-btn>
    </div>
    <div class="app-header__title">
      <span class="app-header__title__route">
        {{ $route.meta.title }}
      </span>
      <span v-if="!showTitleOnly" class="app-header__title__network">
        {{ network }}
      </span>
    </div>
    <div class="app-header__icons">
      <v-btn
        v-if="!showTitleOnly"
        data-cy="app_header_notifications_button"
        class="app-header__notifications-button"
        icon
        height="30px"
        width="25px"
        @click.native="notificationPanel()"
      >
        <v-badge v-if="newNotifications" color="notification" overlap bordered dot>
          <v-img
            height="30px"
            width="25px"
            :src="require('@/assets/notifications/notifications.svg')"
          />
        </v-badge>
        <v-img
          v-else
          height="30px"
          width="25px"
          :src="require('@/assets/notifications/notifications.svg')"
        />
      </v-btn>
      <header-identicon
        v-if="!isDisclaimerRoute"
        data-cy="app_header_icons_identicon"
        class="app-header__icons__identicon"
        @click.native="navigateToAccoount()"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { createNamespacedHelpers, mapGetters, mapState } from 'vuex';
import { RouteNames } from '@/router/route-names';
import NavigationMixin from '@/mixins/navigation-mixin';
import HeaderIdenticon from '@/components/HeaderIdenticon.vue';
import AddressDisplay from '@/components/AddressDisplay.vue';

const { mapState: mapNotificationsState, mapMutations } = createNamespacedHelpers('notifications');

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
    const routesWithoutBackBtn: string[] = [RouteNames.HOME, RouteNames.TRANSFER];
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
@import '@/scss/mixins';
@import '@/scss/colors';
@import '@/scss/fonts';

.app-header {
  align-items: center;
  display: flex;
  height: 80px;

  &__back {
    flex: 1;
    margin-left: 20px;
  }

  &__title {
    display: flex;
    flex-direction: column;
    flex: 3;
    align-items: center;

    &__route {
      color: $color-white;
      font-size: 24px;
    }

    &__network {
      color: $secondary-text-color;
      font-size: 12px;
      font-weight: 500;
    }
  }

  &__icons {
    align-items: center;
    display: flex;
    flex: 1;
    justify-content: flex-end;
    margin-right: 20px;

    &__identicon {
      cursor: pointer;
      margin-left: 15px;
    }
  }
}
</style>
