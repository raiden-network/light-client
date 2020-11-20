<template>
  <div class="app-header">
    <info-overlay v-if="showInfoOverlay" @close-overlay="showInfoOverlay = $event" />
    <header-content
      class="app-header__content"
      :show-info-overlay="showInfoOverlay"
      :show-network="!showTitleOnly"
      @toggle-overlay="showInfoOverlay = $event"
      @navigate-back="navigateBack()"
    >
      <div class="app-header__content__icons">
        <v-btn
          v-if="!showTitleOnly"
          data-cy="app-header_content_icons_notifications-button"
          class="app-header__content__icons__notifications-button"
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
          data-cy="app-header_content_icons_identicon"
          class="app-header__content__icons__identicon"
          @click.native="accountMenu()"
        />
      </div>
    </header-content>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { createNamespacedHelpers, mapGetters } from 'vuex';
import { RouteNames } from '@/router/route-names';
import InfoOverlay from '@/components/overlays/InfoOverlay.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import HeaderIdenticon from '@/components/HeaderIdenticon.vue';
import HeaderContent from '@/components/HeaderContent.vue';

const { mapState: mapNotificationsState, mapMutations } = createNamespacedHelpers('notifications');

@Component({
  components: {
    InfoOverlay,
    HeaderContent,
    HeaderIdenticon,
  },
  computed: {
    ...mapGetters(['isConnected']),
    ...mapNotificationsState(['newNotifications']),
  },
  methods: {
    ...mapMutations(['notificationsViewed']),
  },
})
export default class AppHeader extends Mixins(NavigationMixin) {
  isConnected!: boolean;
  notificationsViewed!: () => void;
  showInfoOverlay = false;

  get isDisclaimerRoute(): boolean {
    return this.$route.name === RouteNames.DISCLAIMER;
  }

  get showTitleOnly(): boolean {
    return this.isDisclaimerRoute || !this.isConnected;
  }

  navigateBack(): void {
    this.onBackClicked();
  }

  notificationPanel(): void {
    this.notificationsViewed();
    this.navigateToNotifications();
    this.showInfoOverlay = false;
  }

  accountMenu(): void {
    this.navigateToAccount();
    this.showInfoOverlay = false;
  }
}
</script>

<style lang="scss" scoped>
@import '@/scss/mixins';

.app-header {
  display: flex;
  height: 80px;
  position: relative;

  &__content {
    &__icons {
      align-items: center;
      display: flex;
      justify-content: flex-end;

      &__identicon {
        cursor: pointer;
        margin-left: 15px;
      }
    }
  }
}
</style>
