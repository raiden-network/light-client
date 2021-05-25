<template>
  <v-snackbar
    v-if="isVisible"
    v-model="notificationToShow.display"
    :value="isVisible"
    class="notification-snackbar"
    :timeout="notificationToShow.duration"
    app
    rounded
    max-width="550px"
    color="primary"
    @input="dismiss"
  >
    <div class="notification-snackbar__area" @click="open">
      <img :src="require('@/assets/notifications/notification_block.svg')" />

      <span class="notification-snackbar__area__title">
        {{ notificationToShow.title }}
      </span>
    </div>

    <template #action="{ attrs }">
      <v-btn
        data-cy="notification-snackbar__dismiss-button"
        icon
        left
        v-bind="attrs"
        @click="dismiss()"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator';
import { createNamespacedHelpers } from 'vuex';

import NavigationMixin from '@/mixins/navigation-mixin';
import type { NotificationPayload } from '@/store/notifications/types';

const { mapGetters, mapMutations } = createNamespacedHelpers('notifications');

@Component({
  computed: {
    ...mapGetters(['notificationQueue']),
  },
  methods: {
    ...mapMutations(['setNotificationShown']),
  },
})
export default class NotificationSnackbar extends Mixins(NavigationMixin) {
  notificationQueue!: NotificationPayload[];
  setNotificationShown!: (notificationId: number) => void;

  get notificationToShow(): NotificationPayload | undefined {
    return this.notificationQueue[0];
  }

  get isVisible(): boolean {
    return this.notificationToShow !== undefined;
  }

  // This will trigger a change of the notification queue which then result
  // into the next notification in the queue to display via the reactive
  // getter.
  dismiss(): void {
    if (this.notificationToShow) {
      this.setNotificationShown(this.notificationToShow.id);
    }
  }

  open(): void {
    this.dismiss();
    this.navigateToNotifications();
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/scroll';

.notification-snackbar {
  &__area {
    display: flex;
    cursor: pointer;

    &__title {
      margin-left: 10px;
      font-size: 16px;
      font-weight: 500;
      padding-top: 2px;
    }
  }
}
</style>
