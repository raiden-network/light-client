<template>
  <div id="notification-panel" data-cy="notification_panel">
    <div class="notification-panel-content">
      <div class="notification-panel-content__close">
        <v-btn text @click="clear()">
          {{ $t('notifications.clear') }}
        </v-btn>
        <v-spacer />
        <v-icon
          data-cy="notification_panel_content_close_button"
          class="notification-panel-content__close__button"
          icon
          @click="onModalBackClicked()"
        >
          mdi-close
        </v-icon>
      </div>
      <v-row
        v-if="notifications.length === 0"
        class="notification-panel-content__no-notifications full-height"
        no-gutters
        justify="center"
        align="center"
      >
        {{ $t('notifications.no-notifications') }}
      </v-row>
      <v-container v-else class="notification-panel-content__notifications" fluid>
        <div class="notification-panel-content__notifications__notification-wrapper">
          <v-list color="transparent">
            <div v-for="notification of notifications" :key="notification.id">
              <v-lazy transition="fade-transition" :options="{ threshold: 0.7 }" min-height="110">
                <notification-card
                  :notification="notification"
                  class="notification-panel-content__notifications__notification-wrapper__notification"
                />
              </v-lazy>
            </div>
          </v-list>
        </div>
      </v-container>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { mapGetters, mapMutations } from 'vuex';

import NotificationCard from '@/components/notification-panel/NotificationCard.vue';
import NavigationMixin from '@/mixins/navigation-mixin';
import type { NotificationPayload } from '@/store/notifications/types';

@Component({
  components: {
    NotificationCard,
  },
  computed: {
    ...mapGetters('notifications', ['notifications']),
  },
  methods: {
    ...mapMutations('notifications', ['clear']),
  },
})
export default class NotificationPanel extends Mixins(NavigationMixin) {
  notifications!: { [key: number]: NotificationPayload };
  clear!: () => void;
}
</script>

<style scoped lang="scss">
@import '@/scss/mixins';
@import '@/scss/colors';

#notification-panel {
  align-items: center;
  display: flex;
  height: 100%;
  justify-content: center;
  position: absolute;
  z-index: 20;
  @include respond-to(handhelds) {
    height: 100vh;
    width: 100%;
  }
}

.notification-panel-content {
  background-color: $notification-panel-bg;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  height: 844px;
  margin-top: 25px;
  width: 620px;
  @include respond-to(handhelds) {
    border-radius: 0;
    height: 100vh;
    margin-top: 0;
    width: 100%;
  }

  &__close {
    display: flex;
    justify-content: flex-end;
    margin: 30px 30px 0 0;
  }

  &__no-notifications {
    font-size: 24px;
    margin-bottom: 60px;
  }

  &__notifications {
    height: 100%;
    margin-bottom: 30px;
    overflow-y: scroll;
    scrollbar-width: none;
    width: 100%;

    &__notification-wrapper {
      max-height: 200px;
      margin: 0 25px 0 25px;

      &__notification {
        margin-bottom: 20px;
      }
    }
  }
}
</style>
