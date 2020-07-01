import { ActionTree } from 'vuex';
import { RootState } from '@/types';
import {
  NotificationPayload,
  NotificationsState,
} from '@/store/notifications/types';
import { NotificationContext } from '@/store/notifications/notification-context';

export const actions: ActionTree<NotificationsState, RootState> = {
  notify: (
    { commit, getters: { nextNotificationId } },
    notification: NotificationPayload
  ) => {
    const payload: NotificationPayload = {
      ...notification,
      id: nextNotificationId,
      received: new Date(),
      display: true,
      context: notification.context ?? NotificationContext.NONE,
      duration: notification.duration ?? 5000,
    };
    commit('notificationAdd', payload);
  },
  notificationShown({ commit, state }, notificationId: number) {
    const index = state.notifications.findIndex(
      (notification) => notification.id === notificationId
    );
    if (index < 0) {
      return;
    }
    const notifications = [...state.notifications];
    notifications[index] = { ...state.notifications[index], display: false };
    commit('notifications', notifications);
  },
};
