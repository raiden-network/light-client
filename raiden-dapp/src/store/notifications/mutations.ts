import { Notification, NotificationsState } from '@/store/notifications/types';
import { MutationTree } from 'vuex';

export const mutations: MutationTree<NotificationsState> = {
  notificationDelete(state: NotificationsState, id: number) {
    state.notifications = state.notifications.filter(
      (notification) => notification.id !== id
    );
  },
  notificationsViewed(state: NotificationsState) {
    state.newNotifications = false;
  },
  notificationAdd(state: NotificationsState, notification: Notification) {
    state.notifications.push(notification);
    state.newNotifications = true;
  },
};
