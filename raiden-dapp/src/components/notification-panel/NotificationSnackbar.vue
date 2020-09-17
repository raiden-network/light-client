<template>
  <v-snackbar
    v-model="notification.display"
    :timeout="notification.duration"
    app
    rounded
    max-width="550px"
    color="primary"
    @input="setNotificationShown(notification.id)"
  >
    <v-row no-gutters class="notification-area">
      <v-col cols="2">
        <img :src="require('@/assets/notification_block.svg')" />
      </v-col>
      <v-col class="notification-area__title">
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
import { Component, Vue, Watch } from 'vue-property-decorator';
import { mapGetters, mapMutations } from 'vuex';
import { NotificationPayload } from '@/store/notifications/types';
import { NotificationImportance } from '@/store/notifications/notification-importance';
import { NotificationContext } from '@/store/notifications/notification-context';

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
export default class NotificationSnackbar extends Vue {
  notification: NotificationPayload = emptyNotification;
  notificationQueue!: NotificationPayload[];
  setNotificationShown!: (notificationId: number) => void;

  @Watch('notificationQueue', { deep: true })
  onQueueChange() {
    if (!this.notification.display && this.notificationQueue.length > 0) {
      const nextNotification = this.notificationQueue.shift();
      if (!nextNotification) {
        return;
      }
      this.$nextTick(() => (this.notification = nextNotification));
    }
  }

  created() {
    this.notification = emptyNotification;
  }

  dismiss() {
    this.setNotificationShown(this.notification.id);
    this.notification = { ...this.notification, display: false };
  }
}
</script>

<style scoped lang="scss">
@import '@/scss/scroll';

.notification-area {
  &__title {
    font-size: 16px;
    font-weight: 500;
    padding-top: 3px;
  }
}
</style>
