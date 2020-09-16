import {
  NotificationPayload,
  NotificationsState,
} from '@/store/notifications/types';
import { MutationTree } from 'vuex';

export const mutations: MutationTree<NotificationsState> = {
  notificationDelete(state: NotificationsState, id: number) {
    delete state.notifications[id];
  },
  notificationsViewed(state: NotificationsState) {
    state.newNotifications = false;
  },
  notificationAddOrReplace(
    state: NotificationsState,
    notification: NotificationPayload
  ) {
    state.notifications[notification.id] = notification;
    state.newNotifications = true;
  },
  setNotificationShown(state: NotificationsState, id: number) {
    state.notifications[id].display = false;
  },
  clear(state: NotificationsState) {
    state.notifications = [];
  },
};
