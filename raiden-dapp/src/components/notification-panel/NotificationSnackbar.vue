<template>
  <v-snackbar
    v-if="notification.display"
    v-model="notification.display"
    class="notification-snackbar"
    :timeout="notification.duration"
    app
    rounded
    max-width="550px"
    color="primary"
    @input="setNotificationShown(notification.id)"
  >
    <v-row no-gutters class="notification-snackbar__area" @click="open">
      <v-col cols="2">
        <img :src="require('@/assets/notifications/notification_block.svg')" />
      </v-col>
      <v-col class="notification-snackbar__area__title">
        <span>
          {{ notification.title }}
        </span>
      </v-col>
    </v-row>
    <template #action="{ attrs }">
      <v-btn icon left v-bind="attrs" @click="dismiss()">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script lang="ts">
import { Component, Mixins, Watch } from 'vue-property-decorator';
import { mapGetters, mapMutations } from 'vuex';

import NavigationMixin from '@/mixins/navigation-mixin';
import { NotificationContext } from '@/store/notifications/notification-context';
import { NotificationImportance } from '@/store/notifications/notification-importance';
import type { NotificationPayload } from '@/store/notifications/types';

const emptyNotification: NotificationPayload = {
  id: -1,
  title: '',
  description: '',
  icon: '',
  display: false,
  duration: 5000,
  importance: NotificationImportance.LOW,
  context: NotificationContext.NONE,
  received: new Date(),
};

@Component({
  computed: {
    ...mapGetters('notifications', ['notificationQueue']),
  },
  methods: {
    ...mapMutations('notifications', ['setNotificationShown']),
  },
})
export default class NotificationSnackbar extends Mixins(NavigationMixin) {
  notification: NotificationPayload = emptyNotification;
  notificationQueue!: NotificationPayload[];
  setNotificationShown!: (notificationId: number) => void;

  @Watch('notificationQueue', { immediate: true, deep: true })
  onQueueChange(): void {
    if (!this.notification.display && this.notificationQueue.length > 0) {
      const nextNotification = this.notificationQueue.shift();
      if (!nextNotification) {
        return;
      }
      this.$nextTick(() => (this.notification = nextNotification));
    }
  }

  created(): void {
    this.notification = emptyNotification;
  }

  dismiss(): void {
    this.setNotificationShown(this.notification.id);
    this.notification = { ...this.notification, display: false };
  }

  open(): void {
    this.navigateToNotifications();
    this.dismiss();
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/scroll';

.notification-snackbar {
  &__area {
    cursor: pointer;

    &__title {
      font-size: 16px;
      font-weight: 500;
      padding-top: 3px;
    }
  }
}
</style>
