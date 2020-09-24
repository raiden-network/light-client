import { GetterTree } from 'vuex';
import { RootState } from '@/types';
import {
  NotificationPayload,
  NotificationsState,
} from '@/store/notifications/types';
import { NotificationImportance } from '@/store/notifications/notification-importance';

export const getters: GetterTree<NotificationsState, RootState> = {
  notifications: (state: NotificationsState): NotificationPayload[] => {
    return Object.values(state.notifications)
      .sort((a, b) => a.id - b.id)
      .reverse();
  },
  nextNotificationId: ({ notifications }: NotificationsState): number => {
    const id = Object.values(notifications).map(
      (notification) => notification.id
    );
    return Math.max(...id, 0) + 1;
  },
  notificationQueue: (state: NotificationsState): NotificationPayload[] => {
    return Object.values(state.notifications).filter(
      (notification) =>
        notification.importance === NotificationImportance.HIGH &&
        notification.display === true
    );
  },
};
